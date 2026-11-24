import { app } from 'electron'
import { join } from 'node:path'
import type {
  SkinCatalogEntry,
  SkinSelection,
  SkinSelectionMeta,
  SkinVariant
} from '@shared/types'
import { readJson, writeJson } from './util'

const MAX_FAVORITES = 500
const MAX_DATA_URL = 3_000_000
const PAGE_URL = /^https:\/\/www\.minecraftskins\.com\/skin\/\d{1,12}\/[^"'\s<>]*$/
const PREVIEW_URL = /^https:\/\/www\.minecraftskins\.com\/uploads\/preview-skins\/[^"'\s<>]+$/

function skinsDir(): string {
  return join(app.getPath('userData'), 'skins')
}

function selectionPath(): string {
  return join(skinsDir(), 'selection.json')
}

function favoritesPath(): string {
  return join(skinsDir(), 'favorites.json')
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function cleanPageUrl(value: unknown): string | undefined {
  const url = typeof value === 'string' ? value.trim() : ''
  return PAGE_URL.test(url) ? url : undefined
}

function cleanMeta(meta: Partial<SkinSelectionMeta> | null | undefined): SkinSelectionMeta {
  const author = cleanText(meta?.author, 80)
  const pageUrl = cleanPageUrl(meta?.pageUrl)
  return {
    id: cleanText(meta?.id, 64) || 'custom',
    name: cleanText(meta?.name, 80) || 'Custom skin',
    ...(author ? { author } : {}),
    ...(pageUrl ? { pageUrl } : {})
  }
}

function isSkinDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_DATA_URL &&
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)
  )
}

export async function saveSkinSelection(
  dataUrl: string,
  variant: SkinVariant,
  meta: Partial<SkinSelectionMeta> | undefined,
  appliedAt: number
): Promise<SkinSelection | null> {
  if (!isSkinDataUrl(dataUrl) || (variant !== 'classic' && variant !== 'slim')) return null
  const selection: SkinSelection = {
    ...cleanMeta(meta),
    variant,
    dataUrl,
    appliedAt: Number.isFinite(appliedAt) && appliedAt > 0 ? appliedAt : Date.now()
  }
  await writeJson(selectionPath(), selection)
  return selection
}

export async function loadSkinSelection(): Promise<SkinSelection | null> {
  const saved = await readJson<Partial<SkinSelection> | null>(selectionPath(), null)
  if (!saved || !isSkinDataUrl(saved.dataUrl)) return null
  return {
    ...cleanMeta(saved),
    variant: saved.variant === 'slim' ? 'slim' : 'classic',
    dataUrl: saved.dataUrl,
    appliedAt: typeof saved.appliedAt === 'number' ? saved.appliedAt : 0
  }
}

function cleanEntry(raw: unknown): SkinCatalogEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Partial<SkinCatalogEntry>
  const id = typeof entry.id === 'string' && /^\d{1,12}$/.test(entry.id) ? entry.id : ''
  const previewUrl =
    typeof entry.previewUrl === 'string' && PREVIEW_URL.test(entry.previewUrl)
      ? entry.previewUrl
      : ''
  const pageUrl = cleanPageUrl(entry.pageUrl)
  if (!id || !previewUrl || !pageUrl) return null
  return {
    id,
    name: cleanText(entry.name, 80) || `Skin ${id}`,
    slug: cleanText(entry.slug, 80),
    author: cleanText(entry.author, 80),
    previewUrl,
    pageUrl,
    likes: Math.max(0, Math.round(Number(entry.likes) || 0)),
    comments: Math.max(0, Math.round(Number(entry.comments) || 0))
  }
}

export async function loadSkinFavorites(): Promise<SkinCatalogEntry[]> {
  const saved = await readJson<unknown>(favoritesPath(), [])
  if (!Array.isArray(saved)) return []
  const seen = new Set<string>()
  const favorites: SkinCatalogEntry[] = []
  for (const raw of saved) {
    const entry = cleanEntry(raw)
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    favorites.push(entry)
    if (favorites.length >= MAX_FAVORITES) break
  }
  return favorites
}

export async function setSkinFavorite(
  entry: SkinCatalogEntry,
  favorite: boolean
): Promise<SkinCatalogEntry[]> {
  const clean = cleanEntry(entry)
  if (!clean) throw new Error('That skin cannot be saved to favorites.')
  const current = await loadSkinFavorites()
  const next = favorite
    ? [clean, ...current.filter((item) => item.id !== clean.id)]
    : current.filter((item) => item.id !== clean.id)
  const capped = next.slice(0, MAX_FAVORITES)
  await writeJson(favoritesPath(), capped)
  return capped
}
