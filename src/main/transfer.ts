import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Instance, ModRecord } from '@shared/types'
import { events } from './events'
import type { Store } from './store'
import { ensureDir, isInside, sanitizeFileName, uid } from './util'

const PACK_FORMAT = 1
const MAX_FILES = 20_000
const MAX_BYTES = 1_500_000_000

interface PackManifest {
  format: number
  app: 'Triad'
  exportedAt: number
  instance: Pick<
    Instance,
    | 'name'
    | 'icon'
    | 'tint'
    | 'mcVersion'
    | 'loader'
    | 'loaderVersion'
    | 'memoryMb'
    | 'javaPath'
    | 'jvmArgs'
    | 'notes'
    | 'servers'
    | 'tags'
    | 'group'
    | 'favorite'
    | 'modpackProjectId'
    | 'modpackVersionId'
  >
  mods: Record<string, ModRecord>
}

const EXCLUDED_ROOTS = new Set([
  'assets',
  'libraries',
  'versions',
  'logs',
  'crash-reports',
  'downloads',
  'runtime',
  'natives',
  'saves-backups'
])

async function walk(root: string, current = root, files: string[] = []): Promise<string[]> {
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      if (current === root && EXCLUDED_ROOTS.has(entry.name)) continue
      await walk(root, path, files)
    } else if (entry.isFile()) {
      files.push(path)
    }
  }
  return files
}

function packPath(root: string, file: string): string {
  return `instance/${relative(root, file).split(sep).join('/')}`
}

export async function exportTriadPack(store: Store, instanceId: string, filePath: string): Promise<void> {
  const instance = store.requireInstance(instanceId)
  const root = store.minecraftDir(instance.id)
  const files = await walk(root)
  if (files.length > MAX_FILES) {
    throw new Error('This instance has too many files to export. Remove screenshots or old worlds first.')
  }

  let total = 0
  const archive: Record<string, Uint8Array> = {}
  for (const file of files) {
    const info = await stat(file)
    total += info.size
    if (total > MAX_BYTES) {
      throw new Error('This instance is larger than 1.5 GB. Remove old worlds or screenshots before exporting.')
    }
    const path = packPath(root, file)
    if (!isInside(root, file)) continue
    archive[path] = new Uint8Array(await readFile(file))
  }

  const manifest: PackManifest = {
    format: PACK_FORMAT,
    app: 'Triad',
    exportedAt: Date.now(),
    instance: {
      name: instance.name,
      icon: instance.icon,
      tint: instance.tint,
      mcVersion: instance.mcVersion,
      loader: instance.loader,
      loaderVersion: instance.loaderVersion,
      memoryMb: instance.memoryMb,
      javaPath: instance.javaPath,
      jvmArgs: instance.jvmArgs,
      notes: instance.notes,
      servers: instance.servers,
      tags: instance.tags,
      group: instance.group,
      favorite: instance.favorite,
      modpackProjectId: instance.modpackProjectId,
      modpackVersionId: instance.modpackVersionId
    },
    mods: store.data.mods[instance.id] ?? {}
  }
  archive['triadpack.json'] = strToU8(JSON.stringify(manifest, null, 2))
  const packed = zipSync(archive, { level: 6 })
  await writeFile(filePath, packed)
  events.dataChanged('instances')
}

function safeName(value: string, fallback: string): string {
  return sanitizeFileName(value).replace(/\.triadpack$/i, '').slice(0, 48) || fallback
}

export async function importTriadPack(store: Store, filePath: string): Promise<Instance> {
  const raw = new Uint8Array(await readFile(filePath))
  let archive: Record<string, Uint8Array>
  try {
    archive = unzipSync(raw)
  } catch {
    throw new Error('That file is not a valid .triadpack archive.')
  }
  const manifestBytes = archive['triadpack.json']
  if (!manifestBytes) throw new Error('This pack is missing triadpack.json.')
  let manifest: PackManifest
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as PackManifest
  } catch {
    throw new Error('This pack has an invalid manifest.')
  }
  if (manifest.format !== PACK_FORMAT || manifest.app !== 'Triad' || !manifest.instance) {
    throw new Error('This pack was made with an unsupported Triad version.')
  }
  const source = manifest.instance
  if (!source.mcVersion || !source.name) throw new Error('This pack is missing its instance details.')

  const names = new Set(store.data.instances.map((instance) => instance.name))
  let name = safeName(source.name, 'Imported instance')
  let index = 2
  while (names.has(name)) name = `${safeName(source.name, 'Imported instance')} ${index++}`

  const instance: Instance = {
    id: uid('inst_'),
    name,
    icon: source.icon || '📦',
    tint: /^#[0-9a-f]{6}$/i.test(source.tint) ? source.tint : '#8f7bff',
    mcVersion: source.mcVersion,
    loader: source.loader ?? 'vanilla',
    loaderVersion: source.loaderVersion,
    memoryMb: source.memoryMb,
    javaPath: source.javaPath,
    jvmArgs: source.jvmArgs,
    notes: source.notes,
    servers: Array.isArray(source.servers) ? source.servers : [],
    tags: Array.isArray(source.tags)
      ? source.tags.map((tag) => String(tag).slice(0, 24)).filter(Boolean).slice(0, 8)
      : [],
    group: source.group ? String(source.group).slice(0, 32) : undefined,
    favorite: !!source.favorite,
    modpackProjectId: source.modpackProjectId,
    modpackVersionId: source.modpackVersionId,
    created: Date.now(),
    playtimeMs: 0
  }

  const root = store.minecraftDir(instance.id)
  await ensureDir(root)
  for (const [entryPath, bytes] of Object.entries(archive)) {
    if (entryPath === 'triadpack.json' || entryPath.endsWith('/')) continue
    if (!entryPath.startsWith('instance/')) continue
    const relativePath = entryPath.slice('instance/'.length)
    if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..')) continue
    const destination = join(root, ...relativePath.split('/'))
    if (!isInside(root, destination)) continue
    await ensureDir(dirname(destination))
    await writeFile(destination, bytes)
  }

  store.addInstance(instance)
  store.data.mods[instance.id] =
    manifest.mods && typeof manifest.mods === 'object' ? manifest.mods : {}
  store.save()
  events.dataChanged('instances')
  return instance
}
