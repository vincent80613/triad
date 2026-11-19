import type {
  ModrinthProject,
  ModrinthSearchParams,
  ModrinthSearchResults,
  ModrinthVersion
} from '@shared/types'
import { fetchJson } from './util'

const API = 'https://api.modrinth.com/v2'

interface CacheEntry<T> {
  at: number
  value: T
}

const cache = new Map<string, CacheEntry<unknown>>()
const PROJECT_TTL = 5 * 60_000
const VERSION_TTL = 60_000
const MAX_CACHE_ENTRIES = 120

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined
  if (hit && Date.now() - hit.at < ttl) return hit.value
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (!oldest) break
    cache.delete(oldest)
  }
  return value
}

export async function searchProjects(params: ModrinthSearchParams): Promise<ModrinthSearchResults> {
  const facets: string[][] = [[`project_type:${params.projectType}`]]
  if (params.gameVersion) facets.push([`versions:${params.gameVersion}`])
  if (params.loader && (params.projectType === 'mod' || params.projectType === 'modpack')) {
    facets.push([`categories:${params.loader}`])
  }
  if (params.category) facets.push([`categories:${params.category}`])
  const query = new URLSearchParams({
    query: params.query ?? '',
    facets: JSON.stringify(facets),
    index: params.sort || 'relevance',
    offset: String(params.offset ?? 0),
    limit: String(params.limit ?? 20)
  })
  return await fetchJson<ModrinthSearchResults>(`${API}/search?${query.toString()}`)
}

export async function getProject(id: string): Promise<ModrinthProject> {
  return await cached(`project:${id}`, PROJECT_TTL, () =>
    fetchJson<ModrinthProject>(`${API}/project/${encodeURIComponent(id)}`)
  )
}

export async function getProjectVersions(
  id: string,
  opts: { gameVersion?: string; loader?: string } = {}
): Promise<ModrinthVersion[]> {
  const query = new URLSearchParams()
  if (opts.gameVersion) query.set('game_versions', JSON.stringify([opts.gameVersion]))
  if (opts.loader) query.set('loaders', JSON.stringify([opts.loader]))
  query.set('include_changelog', 'false')
  const key = `versions:${id}:${opts.gameVersion ?? ''}:${opts.loader ?? ''}`
  return await cached(key, VERSION_TTL, () =>
    fetchJson<ModrinthVersion[]>(
      `${API}/project/${encodeURIComponent(id)}/version?${query.toString()}`
    )
  )
}

export async function getVersion(id: string): Promise<ModrinthVersion> {
  return await cached(`version:${id}`, VERSION_TTL, () =>
    fetchJson<ModrinthVersion>(`${API}/version/${encodeURIComponent(id)}`)
  )
}

export async function getProjects(ids: string[]): Promise<ModrinthProject[]> {
  if (!ids.length) return []
  const query = new URLSearchParams({ ids: JSON.stringify(ids.slice(0, 100)) })
  return await fetchJson<ModrinthProject[]>(`${API}/projects?${query.toString()}`)
}

export function modrinthLoader(loader: string): string | undefined {
  if (loader === 'vanilla') return undefined
  return loader
}
