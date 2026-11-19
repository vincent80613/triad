import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Download,
  Gauge,
  Plus,
  RefreshCw,
  Sparkles,
  Zap
} from 'lucide-react'
import type {
  InstalledMod,
  LoaderType,
  ModrinthVersion
} from '@shared/types'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { cn } from '../lib/format'
import { Glass } from '../components/Glass'
import { Chip, Select, Spinner } from '../components/Controls'
import { performanceModsForLoader, type PerformanceMod } from '../lib/performance'

interface PerformanceItem extends PerformanceMod {
  version: ModrinthVersion | null
  installed?: InstalledMod
}

interface CachedVersion {
  version: ModrinthVersion | null
  checkedAt: number
}

const VERSION_CACHE = new Map<string, CachedVersion>()
const VERSION_REQUESTS = new Map<string, Promise<ModrinthVersion | null>>()
const VERSION_CACHE_TTL = 5 * 60 * 1000
const VERSION_CHECK_LIMIT = 6

function versionCacheKey(
  projectId: string,
  gameVersion: string,
  loader: string | undefined
): string {
  return `${projectId}:${gameVersion}:${loader ?? 'any'}`
}

function loadVersion(
  projectId: string,
  gameVersion: string,
  loader: string | undefined
): Promise<ModrinthVersion | null> {
  const key = versionCacheKey(projectId, gameVersion, loader)
  const cached = VERSION_CACHE.get(key)
  if (cached && Date.now() - cached.checkedAt < VERSION_CACHE_TTL) {
    return Promise.resolve(cached.version)
  }

  const inFlight = VERSION_REQUESTS.get(key)
  if (inFlight) return inFlight

  const request = api.modrinth
    .versions(projectId, { gameVersion, loader })
    .then((list) => {
      const version = list[0] ?? null
      VERSION_CACHE.set(key, { version, checkedAt: Date.now() })
      return version
    })
    .finally(() => {
      VERSION_REQUESTS.delete(key)
    })
  VERSION_REQUESTS.set(key, request)
  return request
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function run(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index])
    }
  }

  const runners = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    () => run()
  )
  await Promise.all(runners)
  return results
}

const LOADER_LABEL: Record<LoaderType, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

function versionLoader(loader: LoaderType): string | undefined {
  if (loader === 'vanilla') return undefined
  return loader === 'quilt' ? 'fabric' : loader
}

export function Performance() {
  const instances = useApp((state) => state.instances)
  const activeInstanceId = useApp((state) => state.activeInstanceId)
  const modsTick = useApp((state) => state.modsTick)
  const pushToast = useApp((state) => state.pushToast)
  const setNewInstanceOpen = useApp((state) => state.setNewInstanceOpen)
  const navigate = useApp((state) => state.navigate)

  const [targetId, setTargetId] = useState(activeInstanceId ?? '')
  const [versions, setVersions] = useState<Record<string, ModrinthVersion | null>>({})
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionFailures, setVersionFailures] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [installed, setInstalled] = useState<InstalledMod[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [installing, setInstalling] = useState(false)
  const [lastQueued, setLastQueued] = useState(0)

  const target = instances.find((instance) => instance.id === targetId)
  const selectionKey = target
    ? `${target.id}:${target.mcVersion}:${target.loader}`
    : ''

  useEffect(() => {
    if (!instances.length) {
      if (targetId) setTargetId('')
      return
    }
    if (!instances.some((instance) => instance.id === targetId)) {
      setTargetId(activeInstanceId ?? instances[0]?.id ?? '')
    }
  }, [activeInstanceId, instances, targetId])

  useEffect(() => {
    setSelected(new Set())
    setLastQueued(0)
  }, [selectionKey])

  useEffect(() => {
    const instance = target
    if (!instance || instance.loader === 'vanilla') {
      setVersions({})
      setVersionsLoading(false)
      setVersionFailures(0)
      return
    }

    let cancelled = false
    setVersions({})
    setVersionsLoading(true)
    setVersionFailures(0)
    setSelected(new Set())

    const defs = performanceModsForLoader(instance.loader)
    const loader = versionLoader(instance.loader)
    const optionalIds = new Set(
      defs.filter((mod) => mod.optional).map((mod) => mod.projectId)
    )

    void (async () => {
      let failures = 0
      const entries = await mapWithConcurrency(
        defs,
        VERSION_CHECK_LIMIT,
        async (mod) => {
          try {
            const version = await loadVersion(mod.projectId, instance.mcVersion, loader)
            return [mod.projectId, version] as const
          } catch {
            failures += 1
            return [mod.projectId, null] as const
          }
        }
      )
      if (cancelled) return
      const versionMap = Object.fromEntries(entries)
      setVersions(versionMap)
      setVersionFailures(failures)
      setVersionsLoading(false)
      setSelected(
        new Set(
          entries
            .filter(([projectId, version]) => !!version && !optionalIds.has(projectId))
            .map(([projectId]) => projectId)
        )
      )
    })()

    return () => {
      cancelled = true
    }
  }, [refreshKey, selectionKey])

  useEffect(() => {
    const instance = target
    if (!instance || instance.loader === 'vanilla') {
      setInstalled([])
      return
    }

    let cancelled = false
    setInstalled([])
    void api.mods
      .list(instance.id)
      .then((list) => {
        if (!cancelled) setInstalled(list)
      })
      .catch(() => {
        if (!cancelled) setInstalled([])
      })

    return () => {
      cancelled = true
    }
  }, [modsTick, target?.id, target?.loader])

  const items = useMemo<PerformanceItem[]>(() => {
    const instance = target
    if (!instance || instance.loader === 'vanilla') return []
    const installedByProject = new Map<string, InstalledMod>()
    for (const mod of installed) {
      if (mod.projectId) installedByProject.set(mod.projectId, mod)
    }
    return performanceModsForLoader(instance.loader).map((mod) => ({
      ...mod,
      version: versions[mod.projectId] ?? null,
      installed: installedByProject.get(mod.projectId)
    }))
  }, [installed, target, versions])

  const availableItems = useMemo(
    () => items.filter((item) => item.version && !item.installed),
    [items]
  )
  const selectedItems = useMemo(
    () =>
      items.filter(
        (item) => item.version && !item.installed && selected.has(item.projectId)
      ),
    [items, selected]
  )
  const installedCount = items.filter((item) => item.installed).length
  const optionalCount = availableItems.filter((item) => item.optional).length
  const allSelected =
    availableItems.length > 0 && selectedItems.length === availableItems.length

  useEffect(() => {
    setSelected((current) => {
      let changed = false
      const next = new Set(current)
      for (const mod of installed) {
        if (mod.projectId && next.delete(mod.projectId)) changed = true
      }
      return changed ? next : current
    })
  }, [installed])

  function toggle(item: PerformanceItem): void {
    if (!item.version || item.installed) return
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(item.projectId)) next.delete(item.projectId)
      else next.add(item.projectId)
      return next
    })
  }

  function selectAll(): void {
    setSelected(new Set(availableItems.map((item) => item.projectId)))
  }

  function clearSelection(): void {
    setSelected(new Set())
  }

  async function downloadSelected(): Promise<void> {
    if (!target || !selectedItems.length || installing) return
    setInstalling(true)
    setLastQueued(0)
    const queuedIds = new Set<string>()
    const failures: string[] = []

    for (const item of selectedItems) {
      if (!item.version) continue
      try {
        await api.modrinth.install(target.id, item.projectId, item.version.id)
        queuedIds.add(item.projectId)
      } catch (error) {
        failures.push(`${item.title}: ${errorMessage(error)}`)
      }
    }

    setInstalling(false)
    if (queuedIds.size) {
      setLastQueued(queuedIds.size)
      setSelected((current) => new Set([...current].filter((id) => !queuedIds.has(id))))
      pushToast({
        title: `${queuedIds.size} performance mod${queuedIds.size === 1 ? '' : 's'} queued`,
        description: `Installing into ${target.name}. Watch the downloads panel for progress.`,
        variant: 'success'
      })
    }
    if (failures.length) {
      pushToast({
        title: 'Some performance mods could not be queued',
        description: failures[0],
        variant: 'error'
      })
    }
  }

  const showModdedState = !!target && target.loader !== 'vanilla'
  const noCompatible =
    showModdedState &&
    !versionsLoading &&
    items.length > 0 &&
    items.every((item) => !item.version)
  const downloadLabel = selectedItems.length
    ? `Download ${selectedItems.length} mod${selectedItems.length === 1 ? '' : 's'}`
    : 'Download selected'

  return (
    <div className="page performance-page">
      <div className="page-header">
        <div className="page-heading">
          <div className="eyebrow">
            <Gauge size={11} /> Frame lab
          </div>
          <h1 className="page-title">Performance</h1>
          <p className="page-sub">
            A broad set of client-side optimizations for rendering, simulation, memory and
            loading. Pick a target instance, then download the recommended kit in one go.
          </p>
        </div>
        <div className="page-actions performance-target">
          {instances.length > 0 ? (
            <>
              <span className="performance-target-label">Install to</span>
              <Select value={targetId} onChange={setTargetId} ariaLabel="Target instance">
                {instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {instance.name} · {instance.mcVersion} · {LOADER_LABEL[instance.loader]}
                  </option>
                ))}
              </Select>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setNewInstanceOpen(true)}
            >
              <Plus size={14} /> New instance
            </button>
          )}
        </div>
      </div>

      {!target ? (
        <Glass className="performance-empty">
          <div className="empty-icon">
            <Gauge size={22} />
          </div>
          <h3>Choose an instance to optimize</h3>
          <p>
            Create a modded instance first. Performance mods are installed client-side and
            can be removed again from the instance&apos;s Mods tab.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setNewInstanceOpen(true)}
          >
            <Plus size={14} /> Create instance
          </button>
        </Glass>
      ) : target.loader === 'vanilla' ? (
        <Glass className="performance-empty">
          <div className="empty-icon">
            <Gauge size={22} />
          </div>
          <h3>This instance is vanilla</h3>
          <p>
            {target.name} cannot load mods. Choose a Fabric, Quilt, Forge or NeoForge
            instance above, or create one for your performance pack.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setNewInstanceOpen(true)}
          >
            <Plus size={14} /> Create modded instance
          </button>
        </Glass>
      ) : (
        <>
          <Glass strong className="performance-summary">
            <div className="performance-summary-head">
              <div className="performance-summary-icon">
                <Zap size={21} />
              </div>
              <div className="performance-summary-copy">
                <div className="eyebrow">
                  <Sparkles size={11} /> Ready-made kit
                </div>
                <h2>More frames, less overhead.</h2>
                <p>
                  A broad mix of rendering, memory, simulation and chunk optimizations for{' '}
                  <strong>{target.name}</strong>. Recommended compatible mods are selected by
                  default; optional hardware and quality trade-offs stay unchecked.
                </p>
              </div>
              <div className="performance-summary-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={availableItems.length === 0 || allSelected}
                  onClick={selectAll}
                >
                  <Check size={13} /> {allSelected ? 'All selected' : 'Select all'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={selectedItems.length === 0}
                  onClick={clearSelection}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={selectedItems.length === 0 || installing}
                  onClick={() => void downloadSelected()}
                >
                  {installing ? <Spinner size={14} /> : <Download size={15} />}
                  {installing ? 'Queuing…' : downloadLabel}
                </button>
                {lastQueued > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-accent-soft"
                    onClick={() => navigate('downloads')}
                  >
                    View downloads
                  </button>
                )}
              </div>
            </div>
            <div className="performance-summary-meta">
              <span>
                <strong>{selectedItems.length}</strong> selected
              </span>
              <span>
                <strong>{availableItems.length}</strong> ready
              </span>
              <span>
                <strong>{installedCount}</strong> installed
              </span>
              {optionalCount > 0 && (
                <span>
                  <strong>{optionalCount}</strong> optional
                </span>
              )}
              <span>
                {target.mcVersion} · {LOADER_LABEL[target.loader]} · client-side
              </span>
              {target.loader === 'quilt' && <span>Fabric-compatible builds</span>}
            </div>
          </Glass>

          {versionFailures > 0 && (
            <Glass className="performance-warning">
              <RefreshCw size={16} />
              <div>
                <strong>Some mod versions could not be checked</strong>
                <p>
                  {versionFailures} request{versionFailures === 1 ? '' : 's'} failed. Check
                  your connection and try again.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setRefreshKey((value) => value + 1)}
              >
                Retry
              </button>
            </Glass>
          )}

          {noCompatible && (
            <Glass className="performance-warning">
              <Sparkles size={16} />
              <div>
                <strong>No compatible builds for {target.mcVersion}</strong>
                <p>
                  This instance&apos;s game version or loader is not covered by the kit yet.
                  Try a newer Minecraft version or a different modded instance.
                </p>
              </div>
            </Glass>
          )}

          {versionsLoading ? (
            <div className="performance-grid" aria-busy="true" aria-label="Checking mod compatibility">
              {Array.from({ length: Math.min(items.length || 6, 8) }).map((_, index) => (
                <div key={index} className="performance-skeleton" />
              ))}
            </div>
          ) : (
            <div className="performance-grid">
              {items.map((item) => {
                const isSelected = selected.has(item.projectId) && !!item.version && !item.installed
                const unavailable = !item.version
                return (
                  <Glass
                    key={item.projectId}
                    matte
                    className={cn(
                      'performance-card',
                      isSelected && 'is-selected',
                      item.installed && 'is-installed',
                      unavailable && 'is-unavailable'
                    )}
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-disabled={unavailable || !!item.installed}
                    aria-label={`${item.title}: ${item.category}${item.optional ? ' (optional)' : ''}`}
                    tabIndex={unavailable || item.installed ? -1 : 0}
                    onClick={() => toggle(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        toggle(item)
                      }
                    }}
                  >
                    <span className="performance-check" aria-hidden>
                      {(isSelected || item.installed) && <Check size={13} />}
                    </span>
                    <div className="performance-icon">
                      {item.icon ? (
                        <img src={item.icon} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <Gauge size={20} />
                      )}
                    </div>
                    <div className="performance-card-copy">
                      <div className="performance-title-line">
                        <h3>{item.title}</h3>
                        {item.installed && <Chip tone="ok">Installed</Chip>}
                        {item.optional && !item.installed && <Chip tone="muted">Optional</Chip>}
                        {unavailable && <Chip tone="muted">Unavailable</Chip>}
                      </div>
                      <p>{item.description}</p>
                      <div className="performance-card-foot">
                        <span className="tag">{item.category}</span>
                        <span className="performance-version">
                          {item.version
                            ? `v${item.version.version_number}`
                            : `No ${target.mcVersion} build`}
                        </span>
                      </div>
                    </div>
                  </Glass>
                )
              })}
            </div>
          )}

          <Glass matte className="performance-note">
            <Sparkles size={15} />
            <p>
              Required dependencies are installed automatically. Optional mods are not
              selected by default. You can disable or remove any of these mods later from the
              instance&apos;s Mods tab. Frame rate still depends on resolution, render distance,
              shaders and your CPU/GPU.
            </p>
          </Glass>
        </>
      )}
    </div>
  )
}
