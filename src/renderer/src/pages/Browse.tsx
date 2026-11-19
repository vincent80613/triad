import { useEffect, useMemo, useState } from 'react'
import { Compass, Search, Sparkles, Wand2, X } from 'lucide-react'
import type { McVersion, ModrinthSearchHit, ProjectType } from '@shared/types'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { cn, compact } from '../lib/format'
import { Glass } from '../components/Glass'
import { Segmented, Select, Spinner } from '../components/Controls'
import { ProjectCard } from '../components/ProjectCard'

const TYPES: { value: ProjectType; label: string }[] = [
  { value: 'mod', label: 'Mods' },
  { value: 'modpack', label: 'Modpacks' },
  { value: 'resourcepack', label: 'Resource packs' },
  { value: 'shader', label: 'Shaders' }
]

const CATEGORIES: Record<ProjectType, { value: string; label: string }[]> = {
  mod: [
    { value: 'optimization', label: 'Optimization' },
    { value: 'adventure', label: 'Adventure' },
    { value: 'technology', label: 'Technology' },
    { value: 'magic', label: 'Magic' },
    { value: 'storage', label: 'Storage' },
    { value: 'worldgen', label: 'Worldgen' },
    { value: 'decoration', label: 'Decoration' },
    { value: 'equipment', label: 'Equipment' },
    { value: 'food', label: 'Food' },
    { value: 'game-mechanics', label: 'Game mechanics' },
    { value: 'library', label: 'Libraries' },
    { value: 'utility', label: 'Utility' },
    { value: 'transportation', label: 'Transport' },
    { value: 'social', label: 'Social' },
    { value: 'economy', label: 'Economy' },
    { value: 'cursed', label: 'Cursed' }
  ],
  modpack: [
    { value: 'adventure', label: 'Adventure' },
    { value: 'challenging', label: 'Challenging' },
    { value: 'combat', label: 'Combat' },
    { value: 'kitchen-sink', label: 'Kitchen sink' },
    { value: 'lightweight', label: 'Lightweight' },
    { value: 'magic', label: 'Magic' },
    { value: 'multiplayer', label: 'Multiplayer' },
    { value: 'optimization', label: 'Optimization' },
    { value: 'quests', label: 'Quests' },
    { value: 'technology', label: 'Technology' }
  ],
  resourcepack: [
    { value: 'combat', label: 'Combat' },
    { value: 'cursed', label: 'Cursed' },
    { value: 'decoration', label: 'Decoration' },
    { value: 'modded', label: 'Modded' },
    { value: 'realistic', label: 'Realistic' },
    { value: 'simplistic', label: 'Simplistic' },
    { value: 'themed', label: 'Themed' },
    { value: 'tweaks', label: 'Tweaks' },
    { value: 'utility', label: 'Utility' },
    { value: 'vanilla-like', label: 'Vanilla-like' }
  ],
  shader: [
    { value: 'cartoon', label: 'Cartoon' },
    { value: 'cursed', label: 'Cursed' },
    { value: 'fantasy', label: 'Fantasy' },
    { value: 'realistic', label: 'Realistic' },
    { value: 'semi-realistic', label: 'Semi-realistic' },
    { value: 'vanilla-like', label: 'Vanilla-like' }
  ]
}

const CATEGORY_ALL_LABEL: Record<ProjectType, string> = {
  mod: 'All mods',
  modpack: 'All modpacks',
  resourcepack: 'All packs',
  shader: 'All shaders'
}

const TYPE_NOUN: Record<ProjectType, string> = {
  mod: 'mods',
  modpack: 'modpacks',
  resourcepack: 'resource packs',
  shader: 'shaders'
}

const SORTS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'follows', label: 'Followers' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently updated' }
] as const

export function Browse() {
  const browse = useApp((state) => state.browse)
  const setBrowse = useApp((state) => state.setBrowse)
  const instances = useApp((state) => state.instances)
  const activeInstanceId = useApp((state) => state.activeInstanceId)
  const [versions, setVersions] = useState<McVersion[]>([])
  const [results, setResults] = useState<ModrinthSearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const active = instances.find((instance) => instance.id === activeInstanceId)

  useEffect(() => {
    void api.versions
      .list()
      .then(setVersions)
      .catch(() => undefined)
  }, [])

  const paramsKey = JSON.stringify([
    browse.projectType,
    browse.query,
    browse.gameVersion,
    browse.loader,
    browse.category,
    browse.sort
  ])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => {
      void api.modrinth
        .search({
          query: browse.query,
          projectType: browse.projectType,
          gameVersion: browse.gameVersion || undefined,
          loader: browse.loader || undefined,
          category: browse.category || undefined,
          sort: browse.sort,
          offset: 0,
          limit: 24
        })
        .then((result) => {
          if (cancelled) return
          setResults(result.hits)
          setTotal(result.total_hits)
        })
        .catch((searchError) => {
          if (!cancelled) setError(errorMessage(searchError))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey])

  const loaderOptions = useMemo(() => {
    if (browse.projectType === 'mod' || browse.projectType === 'modpack') {
      return [
        { value: 'fabric', label: 'Fabric' },
        { value: 'quilt', label: 'Quilt' },
        { value: 'forge', label: 'Forge' },
        { value: 'neoforge', label: 'NeoForge' }
      ]
    }
    return []
  }, [browse.projectType])

  async function loadMore(): Promise<void> {
    setLoadingMore(true)
    try {
      const result = await api.modrinth.search({
        query: browse.query,
        projectType: browse.projectType,
        gameVersion: browse.gameVersion || undefined,
        loader: browse.loader || undefined,
        category: browse.category || undefined,
        sort: browse.sort,
        offset: results.length,
        limit: 24
      })
      setResults([...results, ...result.hits])
      setTotal(result.total_hits)
    } catch (moreError) {
      setError(errorMessage(moreError))
    } finally {
      setLoadingMore(false)
    }
  }

  function changeType(type: ProjectType): void {
    setBrowse({
      projectType: type,
      loader: type === 'resourcepack' || type === 'shader' ? '' : browse.loader,
      category: ''
    })
  }

  const hasFilters = !!(browse.gameVersion || browse.loader || browse.category || browse.query)
  const empty = !loading && results.length === 0

  return (
    <div className="page browse-page">
      <div className="page-header">
        <div className="page-heading">
          <div className="eyebrow">
            <Compass size={11} /> Discover
          </div>
          <h1 className="page-title">Browse {TYPE_NOUN[browse.projectType]}</h1>
          <p className="page-sub">
            {loading && !results.length
              ? 'Searching the catalogue…'
              : `${compact(total)} projects · ${TYPES.find((type) => type.value === browse.projectType)?.label.toLowerCase()}`}
          </p>
        </div>
        {active && (
          <div className="page-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                setBrowse({
                  gameVersion: active.mcVersion,
                  loader: browse.projectType === 'mod' || browse.projectType === 'modpack'
                    ? active.loader === 'vanilla'
                      ? ''
                      : active.loader
                    : browse.loader
                })
              }
            >
              <Wand2 size={13} /> Match {active.name}
            </button>
          </div>
        )}
      </div>

      <Glass matte className="browse-filters">
        <Segmented
          value={browse.projectType}
          onChange={changeType}
          options={TYPES.map((type) => ({ value: type.value, label: type.label }))}
          className="browse-tabs"
        />
        <div className="browse-filter-row">
          <div className="search-box search-box--lg">
            <Search size={15} />
            <input
              value={browse.query}
              onChange={(event) => setBrowse({ query: event.target.value })}
              placeholder={`Search ${TYPES.find((type) => type.value === browse.projectType)?.label.toLowerCase()}…`}
              spellCheck={false}
            />
            {browse.query && (
              <button
                type="button"
                className="icon-btn icon-btn--xs"
                onClick={() => setBrowse({ query: '' })}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <Select
            value={browse.gameVersion}
            onChange={(value) => setBrowse({ gameVersion: value })}
            ariaLabel="Game version"
          >
            <option value="">All versions</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.id}
              </option>
            ))}
          </Select>
          {loaderOptions.length > 0 && (
            <Select
              value={browse.loader}
              onChange={(value) => setBrowse({ loader: value })}
              ariaLabel="Loader"
            >
              <option value="">All loaders</option>
              {loaderOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
          <Select
            value={browse.sort}
            onChange={(value) => setBrowse({ sort: value as typeof browse.sort })}
            ariaLabel="Sort results"
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </Select>
          {hasFilters && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setBrowse({ query: '', gameVersion: '', loader: '', category: '' })}
            >
              Reset
            </button>
          )}
        </div>
        <div
          className="browse-categories"
          aria-label={`${TYPE_NOUN[browse.projectType]} categories`}
        >
          <button
            type="button"
            className={cn('tag tag--button', !browse.category && 'active')}
            aria-pressed={!browse.category}
            onClick={() => setBrowse({ category: '' })}
          >
            {CATEGORY_ALL_LABEL[browse.projectType]}
          </button>
          {CATEGORIES[browse.projectType].map((category) => (
            <button
              key={category.value}
              type="button"
              className={cn('tag tag--button', browse.category === category.value && 'active')}
              aria-pressed={browse.category === category.value}
              onClick={() =>
                setBrowse({ category: browse.category === category.value ? '' : category.value })
              }
            >
              {category.label}
            </button>
          ))}
        </div>
      </Glass>

      {error && (
        <Glass className="browse-error">
          <Sparkles size={16} />
          <div>
            <strong>Couldn't load the catalogue</strong>
            <p>{error}</p>
          </div>
        </Glass>
      )}

      {loading && results.length === 0 ? (
        <div className="project-grid">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="skeleton-card" />
          ))}
        </div>
      ) : empty ? (
        <Glass className="empty-wrap">
          <div className="empty">
            <div className="empty-icon">
              <Search size={22} />
            </div>
            <h3>No projects found</h3>
            <p>
              {hasFilters
                ? 'Try removing the version or loader filter, or search for something else.'
                : 'No projects matched this search. Try something else.'}
            </p>
            {hasFilters && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setBrowse({ query: '', gameVersion: '', loader: '', category: '' })}
              >
                Clear filters
              </button>
            )}
          </div>
        </Glass>
      ) : (
        <>
          <div className={cn('project-grid', loading && 'is-refreshing')}>
            {results.map((project) => (
              <ProjectCard
                key={project.project_id}
                project={project}
                type={browse.projectType}
              />
            ))}
          </div>
          {results.length < total && (
            <div className="load-more">
              <button
                type="button"
                className="btn"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore && <Spinner size={14} />}
                {loadingMore ? 'Loading…' : `Load more (${compact(total - results.length)} left)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
