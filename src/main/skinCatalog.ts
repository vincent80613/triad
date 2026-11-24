import { app, net } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  SkinCatalogEntry,
  SkinCatalogPage,
  SkinCatalogRequest,
  SkinCatalogSort,
  SkinCatalogTexture,
  SkinVariant
} from '@shared/types'
import { readJson, writeJson } from './util'

const ORIGIN = 'https://www.minecraftskins.com'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const SORTS: SkinCatalogSort[] = ['top', 'latest', 'recently-commented']
const LISTING_TTL = 5 * 60_000
const MAX_HTML_CHARS = 4 * 1024 * 1024
const MAX_TEXTURE_BYTES = 2 * 1024 * 1024

const listingCache = new Map<string, { at: number; page: SkinCatalogPage }>()
const textureCache = new Map<string, SkinCatalogTexture>()

function cacheDir(): string {
  return join(app.getPath('userData'), 'skin-library')
}

function headers(accept: string): Record<string, string> {
  return {
    'User-Agent': BROWSER_UA,
    Accept: accept,
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `${ORIGIN}/`
  }
}

async function fetchText(url: string): Promise<string> {
  let response: Response
  try {
    response = await net.fetch(url, {
      headers: headers('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
      signal: AbortSignal.timeout(25_000)
    })
  } catch {
    throw new Error('Could not reach minecraftskins.com. Check your internet connection and try again.')
  }
  if (response.status === 403 || response.status === 429) {
    throw new Error('MinecraftSkins.com is rate-limiting requests. Wait about a minute, then retry.')
  }
  if (!response.ok) {
    throw new Error(`MinecraftSkins.com returned HTTP ${response.status}.`)
  }
  const text = await response.text()
  if (/<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(text)) {
    throw new Error('MinecraftSkins.com asked for a bot check. Wait a minute, then retry.')
  }
  if (text.length > MAX_HTML_CHARS) {
    throw new Error('MinecraftSkins.com sent an unexpected response. Try again.')
  }
  return text
}

function listingUrl(request: SkinCatalogRequest): string {
  const term = request.query?.trim() ?? ''
  if (term) {
    const slug = encodeURIComponent(term.toLowerCase().replace(/\s+/g, '-'))
    return `${ORIGIN}/search/skin/${slug}/${request.page}/`
  }
  if (request.sort === 'top') {
    return request.page === 1 ? `${ORIGIN}/` : `${ORIGIN}/${request.page}/`
  }
  return `${ORIGIN}/${request.sort}/${request.page}/`
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ')
}

function toCount(raw?: string): number {
  if (!raw) return 0
  const match = /^([\d.]+)\s*([km])?$/i.exec(raw.replace(/[,\s]/g, ''))
  if (!match) return 0
  const value = Number.parseFloat(match[1])
  if (!Number.isFinite(value)) return 0
  const suffix = match[2]?.toLowerCase()
  return Math.round(value * (suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1))
}

function parseListing(html: string): SkinCatalogEntry[] {
  const entries: SkinCatalogEntry[] = []
  const seen = new Set<string>()
  const chunks = html.split('<div class="skin"')
  for (let index = 1; index < chunks.length; index += 1) {
    const chunk = chunks[index].slice(0, 5_000)
    const id = /data-id="(\d+)"/.exec(chunk)?.[1]
    const href = /href="(\/skin\/\d+\/[^"#]*?)"/.exec(chunk)?.[1]
    const image = /<img[^>]*src="(\/uploads\/preview-skins\/[^"]+)"[^>]*alt="([^"]*)"/i.exec(chunk)
    if (!id || !href || !image || seen.has(id)) continue
    seen.add(id)
    entries.push({
      id,
      name: decodeEntities(image[2]).trim() || `Skin ${id}`,
      slug: href.split('/')[3] ?? '',
      author: stripTags(/<span class="author-name">([\s\S]*?)<\/span>/.exec(chunk)?.[1] ?? '').trim(),
      previewUrl: ORIGIN + decodeEntities(image[1]),
      pageUrl: ORIGIN + href,
      likes: toCount(/class="likes-count[^"]*"[^>]*>([\d.,kKmM]+)</.exec(chunk)?.[1]),
      comments: toCount(/class="comments-count"[^>]*>([\d.,kKmM]+)</.exec(chunk)?.[1])
    })
  }
  return entries
}

export async function catalogSkins(request: SkinCatalogRequest): Promise<SkinCatalogPage> {
  const sort = SORTS.includes(request.sort) ? request.sort : 'top'
  const page = Math.min(5_000, Math.max(1, Math.floor(Number(request.page) || 1)))
  const query = String(request.query ?? '')
    .trim()
    .slice(0, 100)
  const normalized: SkinCatalogRequest = { sort, page, query }
  const url = listingUrl(normalized)

  const cached = listingCache.get(url)
  if (cached && Date.now() - cached.at < LISTING_TTL) return cached.page

  const html = await fetchText(url)
  const entries = parseListing(html)
  if (!entries.length && !/no (skins|results|matches)|nothing found|0 skins/i.test(html)) {
    throw new Error('Could not read the skin catalogue from minecraftskins.com. Try again.')
  }

  const result: SkinCatalogPage = {
    entries,
    page,
    sort,
    query,
    hasMore: entries.length > 0 && new RegExp(`href="[^"]*\\/${page + 1}\\/"`).test(html),
    source: 'minecraftskins.com'
  }

  listingCache.set(url, { at: Date.now(), page: result })
  if (listingCache.size > 40) {
    const oldest = listingCache.keys().next().value
    if (oldest) listingCache.delete(oldest)
  }
  return result
}

function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function isMinecraftSkin(bytes: Buffer): boolean {
  const size = pngSize(bytes)
  return !!size && size.width === 64 && (size.height === 64 || size.height === 32)
}

export async function readCatalogTexture(request: {
  id: string
  pageUrl: string
}): Promise<SkinCatalogTexture> {
  const id = String(request.id ?? '')
  const pageUrl = String(request.pageUrl ?? '')
  if (!/^\d{1,12}$/.test(id)) throw new Error('Unknown skin.')
  if (!/^https:\/\/www\.minecraftskins\.com\/skin\/\d{1,12}\/[^"'\s<>]*$/.test(pageUrl)) {
    throw new Error('That skin link is not from minecraftskins.com.')
  }

  const cached = textureCache.get(id)
  if (cached) return cached

  const dir = cacheDir()
  const pngPath = join(dir, `${id}.png`)
  const metaPath = join(dir, `${id}.json`)
  const meta = await readJson<{ variant?: SkinVariant } | null>(metaPath, null)

  try {
    const bytes = await readFile(pngPath)
    if (isMinecraftSkin(bytes)) {
      const result: SkinCatalogTexture = {
        id,
        dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
        variant: meta?.variant === 'slim' ? 'slim' : 'classic',
        pageUrl
      }
      textureCache.set(id, result)
      return result
    }
  } catch {
    // No cached texture yet.
  }

  const html = await fetchText(pageUrl)
  const match = /\/uploads\/skins\/\d{4}\/\d{2}\/\d{2}\/[^"'<>\s]+?\.png(?:\?v\d+)?/i.exec(html)
  if (!match) throw new Error('Could not find that skin texture on minecraftskins.com.')

  let response: Response
  try {
    response = await net.fetch(ORIGIN + match[0], {
      headers: headers('image/png,image/*;q=0.8,*/*;q=0.5'),
      signal: AbortSignal.timeout(25_000)
    })
  } catch {
    throw new Error('Could not download that skin. Check your connection and try again.')
  }
  if (!response.ok) {
    throw new Error(`MinecraftSkins.com returned HTTP ${response.status} for that skin.`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > MAX_TEXTURE_BYTES) {
    throw new Error('That skin texture is unexpectedly large.')
  }
  if (!isMinecraftSkin(bytes)) {
    throw new Error('That upload is not a standard 64×64 Minecraft skin, so the game cannot wear it.')
  }

  const arm = /(\d)\s*px arm\s*\((Classic|Slim)\)/i.exec(html)?.[2]
  const variant: SkinVariant = arm?.toLowerCase() === 'slim' ? 'slim' : 'classic'
  await mkdir(dir, { recursive: true })
  await writeFile(pngPath, bytes)
  await writeJson(metaPath, { variant, pageUrl, savedAt: Date.now() })

  const result: SkinCatalogTexture = {
    id,
    dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
    variant,
    pageUrl
  }
  textureCache.set(id, result)
  return result
}
