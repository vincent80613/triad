import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const USER_AGENT = 'Triad/1.0.0 (Minecraft launcher)'

export function uid(prefix = ''): string {
  return prefix + randomUUID().replace(/-/g, '').slice(0, 12)
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return -1
  }
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path))
  const tmp = `${path}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await rm(path, { force: true })
  await rename(tmp, path)
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolvePromise()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function retryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, attempts = 3): Promise<T> {
  const res = await fetchWithRetry(url, init, attempts)
  return (await res.json()) as T
}

export async function fetchText(url: string, init: RequestInit = {}, attempts = 3): Promise<string> {
  const res = await fetchWithRetry(url, init, attempts)
  return await res.text()
}

async function fetchWithRetry(url: string, init: RequestInit, attempts: number): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const signal = AbortSignal.any([
        ...(init.signal ? [init.signal] : []),
        AbortSignal.timeout(45_000)
      ])
      const res = await fetch(url, {
        ...init,
        signal,
        headers: {
          'User-Agent': USER_AGENT,
          ...(init.headers as Record<string, string> | undefined)
        }
      })
      if (res.ok) return res
      if (!retryable(res.status)) {
        const text = await res.text().catch(() => '')
        throw new Error(`Request failed (${res.status}) ${url}${text ? `: ${text.slice(0, 200)}` : ''}`)
      }
      lastError = new Error(`Request failed (${res.status}) ${url}`)
    } catch (error) {
      if ((error as Error)?.name === 'AbortError' && init.signal?.aborted) throw error
      lastError = error
    }
    await sleep(500 * 2 ** attempt)
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export interface DownloadOptions {
  onProgress?: (received: number, total: number) => void
  signal?: AbortSignal
  size?: number
  sha1?: string
  skipIfExists?: boolean
}

export async function sha1File(path: string): Promise<string> {
  const { createReadStream } = await import('node:fs')
  const hash = createHash('sha1')
  await new Promise<void>((resolvePromise, reject) => {
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolvePromise())
      .on('error', reject)
  })
  return hash.digest('hex')
}

export async function downloadFile(
  url: string,
  destination: string,
  options: DownloadOptions = {}
): Promise<void> {
  const expectedSize = options.size ?? 0
  if (options.skipIfExists !== false) {
    const existing = await fileSize(destination)
    if (existing > 0 && (!expectedSize || existing === expectedSize)) {
      if (options.sha1) {
        const actual = await sha1File(destination)
        if (actual === options.sha1) {
          options.onProgress?.(existing, existing)
          return
        }
      } else {
        options.onProgress?.(existing, expectedSize || existing)
        return
      }
    }
  }

  await ensureDir(dirname(destination))
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: options.signal
  })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}) for ${url}`)
  }
  const total = Number(res.headers.get('content-length')) || expectedSize
  const temp = `${destination}.${Date.now()}.part`
  let received = 0
  let lastEmit = 0
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      const now = Date.now()
      if (now - lastEmit > 120) {
        lastEmit = now
        options.onProgress?.(received, total)
      }
      callback(null, chunk)
    }
  })

  try {
    await pipeline(
      Readable.fromWeb(res.body as unknown as Parameters<typeof Readable.fromWeb>[0]),
      counter,
      createWriteStream(temp)
    )
    if (options.sha1) {
      const actual = await sha1File(temp)
      if (actual !== options.sha1) {
        throw new Error(`Checksum mismatch for ${url}`)
      }
    }
    await rm(destination, { force: true })
    await rename(temp, destination)
    options.onProgress?.(received, total || received)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function mapPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const index = cursor++
      if (index >= items.length) return
      await worker(items[index], index)
    }
  })
  await Promise.all(runners)
}

export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel)
}

export function sanitizeFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() || 'file'
  return base.replace(/[<>:"|?*\u0000-\u001f]/g, '_').slice(0, 180)
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}
