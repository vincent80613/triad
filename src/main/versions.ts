import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { MinecraftFolder, Version, type ResolvedVersion } from '@xmcl/core'
import type { Instance, LoaderType, LoaderVersion, McVersion } from '@shared/types'
import type { Store } from './store'
import {
  downloadFile,
  ensureDir,
  fetchJson,
  fetchText,
  mapPool,
  pathExists,
  readJson,
  sanitizeFileName,
  writeJson
} from './util'
import { ensureJava } from './java'

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

interface ManifestVersion {
  id: string
  type: McVersion['type']
  url: string
  time: string
  releaseTime: string
}

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: ManifestVersion[]
}

let manifestCache: { at: number; data: Manifest } | null = null

function cacheDir(): string {
  return join(app.getPath('userData'), 'cache')
}

function manifestFile(): string {
  return join(cacheDir(), 'version_manifest_v2.json')
}

export async function getManifest(force = false): Promise<Manifest> {
  if (!force && manifestCache && Date.now() - manifestCache.at < 30 * 60_000) {
    return manifestCache.data
  }
  if (!force) {
    const disk = await readJson<{ at: number; data: Manifest } | null>(manifestFile(), null)
    if (disk?.data && Date.now() - disk.at < 30 * 60_000) {
      manifestCache = disk
      return disk.data
    }
  }
  const data = await fetchJson<Manifest>(MANIFEST_URL)
  manifestCache = { at: Date.now(), data }
  await writeJson(manifestFile(), manifestCache).catch(() => undefined)
  return data
}

export async function listVersions(showSnapshots: boolean): Promise<McVersion[]> {
  const manifest = await getManifest()
  return manifest.versions
    .filter((version) => showSnapshots || version.type === 'release')
    .map(({ id, type, releaseTime }) => ({ id, type, releaseTime }))
}

export async function latestRelease(): Promise<string> {
  return (await getManifest()).latest.release
}

async function getManifestEntry(id: string): Promise<ManifestVersion> {
  const manifest = await getManifest()
  const entry = manifest.versions.find((version) => version.id === id)
  if (!entry) throw new Error(`Minecraft ${id} was not found in Mojang's version manifest.`)
  return entry
}

type Reporter = (progress: number | null, stage: string) => void

async function installLibraries(
  resolved: ResolvedVersion,
  root: string,
  report: Reporter,
  range: [number, number],
  signal?: AbortSignal
): Promise<void> {
  const libraries = resolved.libraries.filter((library) => library.download?.url)
  if (!libraries.length) return
  let done = 0
  report(range[0], 'Downloading libraries')
  await mapPool(
    libraries,
    12,
    async (library) => {
      const target = join(root, 'libraries', library.download.path)
      await downloadFile(library.download.url, target, {
        signal,
        size: library.download.size > 0 ? library.download.size : undefined
      })
      done++
      report(range[0] + (range[1] - range[0]) * (done / libraries.length), 'Downloading libraries')
    },
    signal
  )
}

async function installAssets(
  resolved: ResolvedVersion,
  root: string,
  report: Reporter,
  range: [number, number],
  signal?: AbortSignal
): Promise<void> {
  const assetIndex = resolved.assetIndex
  if (!assetIndex?.url) return
  const indexPath = join(root, 'assets', 'indexes', `${assetIndex.id}.json`)
  await downloadFile(assetIndex.url, indexPath, { signal, size: assetIndex.size })
  interface AssetObject {
    hash: string
    size: number
  }
  const index = await readJson<{ objects: Record<string, AssetObject> }>(indexPath, { objects: {} })
  const objects = Object.values(index.objects ?? {})
  if (!objects.length) return
  let done = 0
  report(range[0], `Downloading assets (0/${objects.length})`)
  await mapPool(
    objects,
    24,
    async (object) => {
      const prefix = object.hash.slice(0, 2)
      await downloadFile(
        `https://resources.download.minecraft.net/${prefix}/${object.hash}`,
        join(root, 'assets', 'objects', prefix, object.hash),
        { signal, size: object.size, skipIfExists: true }
      )
      done++
      if (done % 25 === 0 || done === objects.length) {
        report(
          range[0] + (range[1] - range[0]) * (done / objects.length),
          `Downloading assets (${done}/${objects.length})`
        )
      }
    },
    signal
  )
}

async function writeLauncherProfiles(root: string): Promise<void> {
  const path = join(root, 'launcher_profiles.json')
  if (await pathExists(path)) return
  await writeFile(
    path,
    JSON.stringify({ profiles: {}, settings: {}, version: 3 }, null, 2),
    'utf8'
  )
}

export async function installMinecraft(
  mcVersion: string,
  root: string,
  report: Reporter,
  signal?: AbortSignal
): Promise<ResolvedVersion> {
  const markerPath = join(root, '.triad', 'vanilla.json')
  const versionJson = join(root, 'versions', mcVersion, `${mcVersion}.json`)
  const versionJar = join(root, 'versions', mcVersion, `${mcVersion}.jar`)
  const marker = await readJson<{ version?: string }>(markerPath, {})
  if (
    marker.version === mcVersion &&
    existsSync(versionJson) &&
    existsSync(versionJar)
  ) {
    return await Version.parse(MinecraftFolder.from(root), mcVersion)
  }

  report(0, 'Fetching Minecraft metadata')
  const entry = await getManifestEntry(mcVersion)
  const folder = MinecraftFolder.from(root)
  await ensureDir(folder.getVersionRoot(mcVersion))
  await writeLauncherProfiles(root)

  report(0.01, 'Downloading version manifest')
  await downloadFile(entry.url, versionJson, { signal, skipIfExists: true })

  let resolved: ResolvedVersion
  try {
    resolved = await Version.parse(folder, mcVersion)
  } catch {
    await rm(versionJson, { force: true })
    await downloadFile(entry.url, versionJson, { signal })
    resolved = await Version.parse(folder, mcVersion)
  }

  if (resolved.downloads.client?.url) {
    report(0.04, 'Downloading client jar')
    await downloadFile(resolved.downloads.client.url, versionJar, {
      signal,
      size: resolved.downloads.client.size,
      sha1: resolved.downloads.client.sha1
    })
  }

  await installLibraries(resolved, root, report, [0.06, 0.32], signal)

  if (resolved.logging?.client?.file?.url) {
    const logFile = resolved.logging.client.file
    await downloadFile(logFile.url, join(root, 'assets', 'log_configs', logFile.id), {
      signal,
      size: logFile.size
    }).catch(() => undefined)
  }

  await installAssets(resolved, root, report, [0.32, 0.99], signal)

  const javaMajor = resolved.javaVersion?.majorVersion ?? 8
  await writeJson(markerPath, { version: mcVersion, javaMajor, at: Date.now() })
  report(1, 'Minecraft ready')
  return resolved
}

async function installLoaderLibraries(
  versionId: string,
  root: string,
  report: Reporter,
  signal?: AbortSignal
): Promise<ResolvedVersion> {
  const resolved = await Version.parse(MinecraftFolder.from(root), versionId)
  await installLibraries(resolved, root, report, [0, 1], signal)
  return resolved
}

async function installFabricLike(
  loader: 'fabric' | 'quilt',
  mcVersion: string,
  loaderVersion: string,
  root: string,
  report: Reporter,
  signal?: AbortSignal
): Promise<string> {
  const base =
    loader === 'fabric' ? 'https://meta.fabricmc.net/v2' : 'https://meta.quiltmc.org/v3'
  report(null, `Installing ${loader === 'fabric' ? 'Fabric' : 'Quilt'} loader`)
  const profile = await fetchJson<{ id: string }>(
    `${base}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
  )
  if (!profile.id) throw new Error(`Could not resolve the ${loader} loader profile.`)
  const path = join(root, 'versions', profile.id, `${profile.id}.json`)
  await ensureDir(join(root, 'versions', profile.id))
  await writeFile(path, JSON.stringify(profile, null, 2), 'utf8')
  await installLoaderLibraries(profile.id, root, report, signal)
  return profile.id
}

async function findInstalledVersion(
  root: string,
  mcVersion: string,
  loaderVersion: string,
  loader: 'forge' | 'neoforge'
): Promise<string | null> {
  const dir = join(root, 'versions')
  let entries: string[] = []
  try {
    entries = await readdir(dir)
  } catch {
    return null
  }
  const candidates: { id: string; at: number }[] = []
  for (const name of entries) {
    try {
      const json = JSON.parse(
        await readFile(join(dir, name, `${name}.json`), 'utf8')
      ) as { id?: string; inheritsFrom?: string }
      const id = json.id ?? name
      if (json.inheritsFrom !== mcVersion) continue
      if (!id.includes(loaderVersion)) continue
      if (loader === 'forge' && !id.toLowerCase().includes('forge')) continue
      if (loader === 'neoforge' && !id.toLowerCase().includes('neoforge')) continue
      const info = await stat(join(dir, name, `${name}.json`))
      candidates.push({ id, at: info.mtimeMs })
    } catch {
      // ignore
    }
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => b.at - a.at)
  return candidates[0].id
}

async function runForgeInstaller(
  installerPath: string,
  root: string,
  javaPath: string,
  report: Reporter,
  signal?: AbortSignal
): Promise<void> {
  await ensureDir(root)
  const tail: string[] = []
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(javaPath, ['-jar', installerPath, '--installClient', root], {
      cwd: root,
      windowsHide: true
    })
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('The Forge installer timed out after 15 minutes.'))
    }, 15 * 60_000)

    const onAbort = (): void => {
      child.kill()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const handle = (chunk: Buffer): void => {
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean)
      for (const line of lines) {
        tail.push(line)
        if (tail.length > 30) tail.shift()
        if (/install|download|extract|process|patch/i.test(line)) {
          report(null, line.replace(/^\[[^\]]+\]\s*/, '').slice(0, 120))
        }
      }
    }
    child.stdout?.on('data', handle)
    child.stderr?.on('data', handle)
    child.on('error', (error) => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      if (code === 0) resolvePromise()
      else {
        reject(
          new Error(
            `The Forge installer failed (exit code ${code}). ${tail.slice(-4).join(' · ').slice(0, 400)}`
          )
        )
      }
    })
  })
}

async function installForgeLike(
  loader: 'forge' | 'neoforge',
  mcVersion: string,
  loaderVersion: string,
  root: string,
  javaPath: string,
  report: Reporter,
  signal?: AbortSignal
): Promise<string> {
  const existing = await findInstalledVersion(root, mcVersion, loaderVersion, loader)
  if (existing) {
    report(1, `${loader === 'forge' ? 'Forge' : 'NeoForge'} already installed`)
    return existing
  }

  await writeLauncherProfiles(root)
  const fileName =
    loader === 'forge'
      ? `forge-${mcVersion}-${loaderVersion}-installer.jar`
      : `neoforge-${loaderVersion}-installer.jar`
  const url =
    loader === 'forge'
      ? `https://maven.minecraftforge.net/net/minecraftforge/forge/${encodeURIComponent(`${mcVersion}-${loaderVersion}`)}/${fileName}`
      : `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/${fileName}`
  const installerPath = join(cacheDir(), 'installers', sanitizeFileName(fileName))

  report(0.05, `Downloading the ${loader === 'forge' ? 'Forge' : 'NeoForge'} installer`)
  await downloadFile(url, installerPath, { signal, skipIfExists: true })

  report(null, `Running the ${loader === 'forge' ? 'Forge' : 'NeoForge'} installer (this can take a few minutes)`)
  await runForgeInstaller(installerPath, root, javaPath, report, signal)

  const installed = await findInstalledVersion(root, mcVersion, loaderVersion, loader)
  if (!installed) {
    throw new Error(
      `The ${loader === 'forge' ? 'Forge' : 'NeoForge'} installer completed but no profile was created. Check the Java runtime and try again.`
    )
  }
  await installLoaderLibraries(installed, root, report, signal)
  return installed
}

export async function loaderVersions(
  mcVersion: string,
  loader: LoaderType
): Promise<LoaderVersion[]> {
  if (loader === 'vanilla') return []
  if (loader === 'fabric' || loader === 'quilt') {
    const base =
      loader === 'fabric' ? 'https://meta.fabricmc.net/v2' : 'https://meta.quiltmc.org/v3'
    const data = await fetchJson<
      { loader?: { version?: string; stable?: boolean } }[]
    >(`${base}/versions/loader/${encodeURIComponent(mcVersion)}`)
    const versions = data
      .map((entry) => ({
        version: entry.loader?.version ?? '',
        stable: entry.loader?.stable ?? false
      }))
      .filter((entry) => entry.version)
    const stable = versions.filter((entry) => entry.stable)
    return (stable.length ? stable : versions).slice(0, 30)
  }

  const isNeo = loader === 'neoforge'
  const xml = await fetchText(
    isNeo
      ? 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml'
      : 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'
  )
  const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1])
  const prefix = isNeo
    ? neoForgePrefix(mcVersion)
    : `${mcVersion}-`
  const versions = all
    .filter((version) => version.startsWith(prefix))
    .map((version) => (isNeo ? version : version.slice(prefix.length)))
    .filter((version) => !version.includes('snapshot') && !version.includes('alpha'))
  versions.sort(compareVersionsDesc)
  return [...new Set(versions)].slice(0, 40).map((version) => ({ version }))
}

function neoForgePrefix(mcVersion: string): string {
  const parts = mcVersion.split('.')
  const normalized = parts[0] === '1' ? parts.slice(1) : parts
  if (normalized.length === 1) return `${normalized[0]}.0.`
  return `${normalized.join('.')}.`
}

function compareVersionsDesc(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value
      .split(/[.\-+_]/)
      .slice(0, 4)
      .map((part) => Number.parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < 4; i++) {
    const diff = (right[i] ?? 0) - (left[i] ?? 0)
    if (diff !== 0) return diff
  }
  return b.localeCompare(a)
}

export interface EnsureResult {
  versionId: string
  javaMajor: number
}

export async function ensureInstanceVersion(
  instance: Instance,
  store: Store,
  javaPath: string | undefined,
  report: Reporter,
  signal?: AbortSignal
): Promise<EnsureResult> {
  const root = store.sharedDir
  const gameDir = store.minecraftDir(instance.id)
  const metaDir = store.metaDir(instance.id)
  await Promise.all([ensureDir(root), ensureDir(gameDir), ensureDir(metaDir)])

  const markerPath = join(metaDir, 'install.json')
  const marker = await readJson<{
    mcVersion?: string
    loader?: LoaderType
    loaderVersion?: string
    versionId?: string
    javaMajor?: number
  }>(markerPath, {})
  if (
    marker.mcVersion === instance.mcVersion &&
    marker.loader === instance.loader &&
    marker.loaderVersion === (instance.loaderVersion ?? '') &&
    marker.versionId &&
    existsSync(join(root, 'versions', marker.versionId, `${marker.versionId}.json`))
  ) {
    if (typeof marker.javaMajor === 'number') {
      return { versionId: marker.versionId, javaMajor: marker.javaMajor }
    }
    const resolved = await Version.parse(MinecraftFolder.from(root), marker.versionId)
    const javaMajor = resolved.javaVersion?.majorVersion ?? 8
    await writeJson(markerPath, { ...marker, javaMajor, at: Date.now() })
    return { versionId: marker.versionId, javaMajor }
  }

  report(0, 'Preparing Minecraft')
  await installMinecraft(instance.mcVersion, root, (progress, stage) => {
    report(progress === null ? null : progress * 0.7, stage)
  }, signal)

  let loaderVersion = instance.loaderVersion ?? ''
  let versionId = instance.mcVersion

  if (instance.loader !== 'vanilla') {
    if (!loaderVersion) {
      const versions = await loaderVersions(instance.mcVersion, instance.loader)
      loaderVersion = versions[0]?.version ?? ''
      if (!loaderVersion) {
        throw new Error(
          `No ${instance.loader} loader is available for Minecraft ${instance.mcVersion}.`
        )
      }
      instance.loaderVersion = loaderVersion
    }
    report(0.72, `Installing ${instance.loader} ${loaderVersion}`)
    if (instance.loader === 'fabric' || instance.loader === 'quilt') {
      versionId = await installFabricLike(
        instance.loader,
        instance.mcVersion,
        loaderVersion,
        root,
        (progress, stage) => {
          report(progress === null ? null : 0.72 + progress * 0.28, stage)
        },
        signal
      )
    } else {
      let installerJava = javaPath
      if (!installerJava) {
        const base = await Version.parse(MinecraftFolder.from(root), instance.mcVersion)
        installerJava = (
          await ensureJava(base.javaVersion?.majorVersion ?? 17, undefined, (progress, stage) =>
            report(progress === null ? null : 0.72 + progress * 0.02, stage)
          )
        ).java.path
      }
      versionId = await installForgeLike(
        instance.loader,
        instance.mcVersion,
        loaderVersion,
        root,
        installerJava,
        (progress, stage) => {
          report(progress === null ? null : 0.72 + progress * 0.28, stage)
        },
        signal
      )
    }
  }

  const resolved = await Version.parse(MinecraftFolder.from(root), versionId)
  const javaMajor = resolved.javaVersion?.majorVersion ?? 8
  await writeJson(markerPath, {
    mcVersion: instance.mcVersion,
    loader: instance.loader,
    loaderVersion,
    versionId,
    javaMajor,
    at: Date.now()
  })

  if (instance.versionId !== versionId || instance.loaderVersion !== loaderVersion) {
    instance.versionId = versionId
    instance.loaderVersion = loaderVersion || undefined
    store.save()
  }

  report(1, 'Ready to launch')
  return { versionId, javaMajor }
}
