import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, readdir, stat, symlink } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { JavaInfo } from '@shared/types'
import {
  downloadFile,
  ensureDir,
  fetchJson,
  formatBytes,
  isInside,
  mapPool
} from './util'

const execFileAsync = promisify(execFile)

let cache: JavaInfo[] | null = null
const resolutionCache = new Map<
  string,
  { mtimeMs: number; size: number; info: JavaInfo | null }
>()

const RUNTIME_MANIFEST_URL =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'

interface RuntimeEntry {
  manifest?: { url?: string; sha1?: string }
  version?: { name?: string }
}

interface RuntimeFile {
  type: 'file' | 'directory' | 'link'
  executable?: boolean
  target?: string
  downloads?: { raw?: { url: string; sha1: string; size: number } }
}

type Reporter = (progress: number | null, stage: string) => void

function javaExecutable(home: string): string {
  return process.platform === 'win32' ? join(home, 'bin', 'java.exe') : join(home, 'bin', 'java')
}

export function parseJavaVersion(output: string): { version: string; major: number } | null {
  const match = output.match(/version\s+"([^"]+)"/i)
  if (!match) return null
  const version = match[1]
  const parts = version.split(/[.+-]/)
  let major = Number(parts[0])
  if (major === 1 && parts.length > 1) major = Number(parts[1])
  if (!Number.isFinite(major)) return null
  return { version, major }
}

function runtimePlatform(): string | null {
  if (process.platform === 'win32') {
    if (process.arch === 'arm64') return 'windows-arm64'
    if (process.arch === 'ia32') return 'windows-x86'
    return 'windows-x64'
  }
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  if (process.platform === 'linux') return process.arch === 'ia32' ? 'linux-i386' : 'linux'
  return null
}

function javaMajorFromName(name: string | undefined): number {
  const match = name ? /^(\d+)/.exec(name) : null
  return match ? Number(match[1]) : 0
}


export async function resolveJava(path: string): Promise<JavaInfo | null> {
  let executable = path
  try {
    const file = await stat(executable).catch(() => null)
    if (!file?.isFile()) return null
    const key = process.platform === 'win32' ? resolve(executable).toLowerCase() : resolve(executable)
    const cached = resolutionCache.get(key)
    if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) {
      return cached.info
    }
    const info = await execFileAsync(executable, ['-version'], {
      timeout: 15_000,
      windowsHide: true
    }).catch((error: { stderr?: string; stdout?: string }) => ({
      stderr: error?.stderr ?? '',
      stdout: error?.stdout ?? ''
    }))
    const text = `${info.stdout ?? ''}\n${info.stderr ?? ''}`
    const parsed = parseJavaVersion(text)
    const resolvedInfo = parsed
      ? { path: executable, version: parsed.version, major: parsed.major }
      : null
    resolutionCache.set(key, { mtimeMs: file.mtimeMs, size: file.size, info: resolvedInfo })
    return resolvedInfo
  } catch {
    return null
  }
}

async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name))
  } catch {
    return []
  }
}

async function scanRuntimeFolders(root: string, depth = 2): Promise<string[]> {
  const found: string[] = []
  const walk = async (dir: string, remaining: number): Promise<void> => {
    const exe = javaExecutable(dir)
    if (existsSync(exe)) {
      found.push(exe)
      return
    }
    if (remaining <= 0) return
    for (const child of await listDirs(dir)) {
      await walk(child, remaining - 1)
    }
  }
  await walk(root, depth)
  return found
}

function runtimeVersion(executable: string): { version: string; major: number } | null {
  const home = basename(dirname(dirname(executable)))
  const match = /(\d+)(?:[._](\d+))?(?:[._](\d+))?$/.exec(home)
  if (!match) return null
  const major = Number(match[1])
  if (!Number.isFinite(major)) return null
  return { version: match[0], major }
}

async function bundledJava(requiredMajor: number): Promise<JavaInfo | null> {
  const root = join(app.getPath('userData'), 'runtimes')
  const executables = await scanRuntimeFolders(root, 3)
  const compatible: JavaInfo[] = []
  for (const executable of executables) {
    const info = runtimeVersion(executable)
    if (!info || info.major < requiredMajor) continue
    compatible.push({ path: executable, version: info.version, major: info.major })
  }
  compatible.sort((a, b) => a.major - b.major || a.path.localeCompare(b.path))
  return compatible[0] ?? null
}

async function candidatePaths(): Promise<string[]> {
  const candidates = new Set<string>()
  const env = process.env.JAVA_HOME
  if (env) candidates.add(javaExecutable(env))
  for (const exe of await scanRuntimeFolders(join(app.getPath('userData'), 'runtimes'), 3)) {
    candidates.add(exe)
  }
  if (process.platform === 'win32') {
    const roots = [
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\Zulu',
      'C:\\Program Files\\BellSoft',
      'C:\\Program Files\\Amazon Corretto',
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Eclipse Adoptium'),
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Microsoft'),
      join(process.env.APPDATA ?? '', '.minecraft', 'runtime'),
      'C:\\Program Files (x86)\\Minecraft Launcher\\runtime',
      join(
        process.env.LOCALAPPDATA ?? '',
        'Packages',
        'Microsoft.4297127D64EC6_8wekyb3d8bbwe',
        'LocalCache',
        'Local',
        'runtime'
      )
    ]
    for (const root of roots) {
      if (root) for (const exe of await scanRuntimeFolders(root)) candidates.add(exe)
    }
    for (const name of ['java.exe']) {
      try {
        const { stdout } = await execFileAsync('where', [name], { windowsHide: true })
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => candidates.add(line))
      } catch {
        // ignore
      }
    }
  } else {
    for (const root of ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines', '/opt/homebrew/opt']) {
      for (const exe of await scanRuntimeFolders(root, 2)) candidates.add(exe)
    }
    try {
      const { stdout } = await execFileAsync('which', ['java'], { windowsHide: true })
      if (stdout.trim()) candidates.add(stdout.trim())
    } catch {
      // ignore
    }
  }
  return [...candidates]
}

export async function detectJava(refresh = false): Promise<JavaInfo[]> {
  if (cache && !refresh) return cache
  const paths = await candidatePaths()
  const resolved = await Promise.all([...new Set(paths)].map((path) => resolveJava(path)))
  const unique = new Map<string, JavaInfo>()
  for (const info of resolved) {
    if (!info) continue
    const key = info.path.toLowerCase()
    const existing = unique.get(key)
    if (!existing || existing.major < info.major) unique.set(key, info)
  }
  cache = [...unique.values()].sort((a, b) => b.major - a.major || a.path.localeCompare(b.path))
  return cache
}

export async function installJavaRuntime(
  requiredMajor: number,
  report: Reporter,
  signal?: AbortSignal
): Promise<JavaInfo> {
  const platform = runtimePlatform()
  if (!platform) throw new Error('Automatic Java downloads are not supported on this platform.')

  report(0, 'Finding a Java runtime')
  const manifest = await fetchJson<Record<string, Record<string, RuntimeEntry[]>>>(RUNTIME_MANIFEST_URL)
  const candidates = Object.entries(manifest[platform] ?? {})
    .filter(([component]) => !component.includes('snapshot'))
    .flatMap(([component, entries]) =>
      (entries ?? []).map((entry) => ({
        component,
        major: javaMajorFromName(entry.version?.name),
        name: entry.version?.name ?? component,
        url: entry.manifest?.url
      }))
    )
    .filter((entry) => entry.url && entry.major >= requiredMajor)
    .sort((a, b) => a.major - b.major)

  if (!candidates.length) {
    throw new Error(
      `Mojang does not offer a Java ${requiredMajor} runtime for this platform. Install one from adoptium.net and pick it in Settings.`
    )
  }

  const chosen = candidates[0]
  const root = join(app.getPath('userData'), 'runtimes', `${chosen.component}-${chosen.name}`)
  const executable = javaExecutable(root)
  const existing = existsSync(executable) ? await resolveJava(executable) : null
  if (existing) return existing

  report(0, `Downloading Java ${chosen.major}`)
  const files = await fetchJson<{ files?: Record<string, RuntimeFile> }>(chosen.url as string)
  const entries = Object.entries(files.files ?? {})
  if (!entries.length) throw new Error('The Java runtime manifest was empty.')

  const totalBytes = entries.reduce(
    (sum, [, file]) => sum + (file.downloads?.raw?.size ?? 0),
    0
  )
  let completed = 0

  await ensureDir(root)
  await mapPool(
    entries,
    8,
    async ([relativePath, file]) => {
      const destination = resolve(root, relativePath)
      if (!isInside(root, destination)) return
      if (file.type === 'directory') {
        await ensureDir(destination)
        return
      }
      if (file.type === 'link') {
        await ensureDir(resolve(destination, '..'))
        await symlink(file.target ?? '', destination).catch(() => undefined)
        return
      }
      const raw = file.downloads?.raw
      if (!raw?.url) return
      await downloadFile(raw.url, destination, {
        signal,
        size: raw.size,
        sha1: raw.sha1,
        skipIfExists: true
      })
      if (file.executable && process.platform !== 'win32') {
        await chmod(destination, 0o755).catch(() => undefined)
      }
      completed += raw.size ?? 0
      report(
        totalBytes ? Math.min(1, completed / totalBytes) : null,
        `Downloading Java ${chosen.major} (${formatBytes(completed)} of ${formatBytes(totalBytes)})`
      )
    },
    signal
  )

  clearJavaCache()
  const info = await resolveJava(executable)
  if (!info) {
    throw new Error('The Java runtime was downloaded but could not be started. Try installing Java manually.')
  }
  report(1, `Java ${info.major} ready`)
  return info
}

export async function pickJava(
  requiredMajor: number,
  preferred?: string
): Promise<{ java: JavaInfo; warning?: string }> {
  if (preferred) {
    const explicit = await resolveJava(preferred)
    if (!explicit) throw new Error(`The selected Java executable could not be started: ${preferred}`)
    if (explicit.major < requiredMajor) {
      throw new Error(
        `Java ${requiredMajor}+ is required for this version, but ${basename(explicit.path)} is Java ${explicit.major}.`
      )
    }
    return { java: explicit }
  }
  const bundled = await bundledJava(requiredMajor)
  if (bundled) return { java: bundled }
  const javas = await detectJava()
  const compatible = javas.filter((java) => java.major >= requiredMajor).sort((a, b) => a.major - b.major)
  if (!compatible.length) {
    throw new Error(
      `No Java ${requiredMajor}+ runtime found. Install a JDK from adoptium.net, then rescan in Settings → Java.`
    )
  }
  const java = compatible[0]
  return {
    java,
    warning:
      javas.length === 0
        ? undefined
        : `Using Java ${java.major} at ${java.path}`
  }
}

export async function ensureJava(
  requiredMajor: number,
  preferred?: string,
  report?: Reporter,
  signal?: AbortSignal
): Promise<{ java: JavaInfo; warning?: string }> {
  try {
    return await pickJava(requiredMajor, preferred)
  } catch (error) {
    if (preferred || !report) throw error
    const java = await installJavaRuntime(requiredMajor, report, signal)
    return { java, warning: `Downloaded Java ${java.major} for Minecraft.` }
  }
}

export function clearJavaCache(): void {
  cache = null
  resolutionCache.clear()
}
