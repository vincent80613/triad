import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Clock,
  Copy,
  Cpu,
  Download,
  FolderOpen,
  Gauge,
  Package,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  ShieldCheck,
  Square,
  Star,
  Trash2,
  Upload
} from 'lucide-react'
import type {
  HealthReport,
  Instance,
  InstalledMod,
  JavaInfo,
  ModUpdate,
  World
} from '@shared/types'
import { useT } from '../i18n'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { bytes, cn, compact, loaderLabel, playtime, relativeTime } from '../lib/format'
import { performanceModsForLoader } from '../lib/performance'
import { playInstance, stopGame } from '../lib/launch'
import { Glass } from '../components/Glass'
import { Chip, EmptyState, ProgressBar, Slider, Spinner, Toggle } from '../components/Controls'
import { Modal, ModalHeader } from '../components/Modal'

type Tab = 'overview' | 'mods' | 'worlds' | 'servers' | 'health' | 'logs' | 'settings'

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function supportsWorldQuickPlay(version: string): boolean {
  const [major, minor] = version.split('.').map((part) => Number.parseInt(part, 10))
  if (!Number.isFinite(major)) return true
  if (major > 1) return true
  return major === 1 && (minor ?? 0) >= 20
}

export function InstanceDetail() {
  const instance = useApp((state) =>
    state.instances.find((entry) => entry.id === state.selectedInstanceId)
  )
  const navigate = useApp((state) => state.navigate)

  if (!instance) {
    return (
      <div className="page">
        <Glass className="empty-wrap">
          <EmptyState
            icon={<Package size={22} />}
            title="Instance not found"
            description="It may have been deleted."
            action={
              <button type="button" className="btn" onClick={() => navigate('library')}>
                Back to library
              </button>
            }
          />
        </Glass>
      </div>
    )
  }

  return <InstanceView key={instance.id} instance={instance} />
}

function InstanceView({ instance }: { instance: Instance }) {
  const t = useT()
  const launch = useApp((state) => state.launch)
  const settings = useApp((state) => state.settings)
  const account = useApp((state) => state.account)
  const modsTick = useApp((state) => state.modsTick)
  const navigate = useApp((state) => state.navigate)
  const pushToast = useApp((state) => state.pushToast)
  const refreshInstances = useApp((state) => state.refreshInstances)
  const openInstance = useApp((state) => state.openInstance)
  const setActiveInstance = useApp((state) => state.setActiveInstance)
  const setBrowse = useApp((state) => state.setBrowse) 
  const [tab, setTab] = useState<Tab>('overview')
  const [mods, setMods] = useState<InstalledMod[]>([])
  const [worlds, setWorlds] = useState<World[]>([])
  const [logs, setLogs] = useState('')
  const [javas, setJavas] = useState<JavaInfo[]>([])
  const [loadingMods, setLoadingMods] = useState(true)
  const [importing, setImporting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updates, setUpdates] = useState<ModUpdate[]>([])
  const [modQuery, setModQuery] = useState('')
  const [confirmFile, setConfirmFile] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [health, setHealth] = useState<HealthReport | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [serverName, setServerName] = useState('')
  const [serverAddress, setServerAddress] = useState('')
  const [serverSaving, setServerSaving] = useState(false)
  const modInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    name: instance.name,
    memoryMb: instance.memoryMb ?? 4096,
    javaPath: instance.javaPath ?? '',
    jvmArgs: instance.jvmArgs ?? '',
    notes: instance.notes ?? '',
    tags: (instance.tags ?? []).join(', '),
    group: instance.group ?? '',
    favorite: !!instance.favorite
  })

  const running =
    launch.instanceId === instance.id &&
    (launch.status === 'running' || launch.status === 'preparing' || launch.status === 'stopping')
  const launchBusy = launch.status === 'preparing' || launch.status === 'running'

  const updatesByProject = useMemo(() => {
    const map = new Map<string, ModUpdate>()
    for (const update of updates) map.set(update.projectId, update)
    return map
  }, [updates])

  const servers = instance.servers ?? []
  const quickPlayWorlds = supportsWorldQuickPlay(instance.mcVersion)

  const filteredMods = useMemo(() => {
    const q = modQuery.trim().toLowerCase()
    if (!q) return mods
    return mods.filter(
      (mod) => mod.title.toLowerCase().includes(q) || mod.fileName.toLowerCase().includes(q)
    )
  }, [mods, modQuery])

  const performanceKit = useMemo(() => {
    const installedByProject = new Map<string, InstalledMod>()
    for (const mod of mods) {
      if (mod.projectId) installedByProject.set(mod.projectId, mod)
    }
    return performanceModsForLoader(instance.loader)
      .filter((mod) => !mod.optional)
      .map((mod) => ({
        ...mod,
        installedMod: installedByProject.get(mod.projectId)
      }))
  }, [instance.loader, mods])
  const performanceInstalled = performanceKit.filter((entry) => entry.installedMod).length
  const performanceDisabled = performanceKit.filter(
    (entry) => entry.installedMod && !entry.installedMod.enabled
  ).length
  const performanceMissing = performanceKit.length - performanceInstalled
  const performanceComplete = performanceKit.length > 0 && performanceMissing === 0

  async function loadMods(): Promise<void> {
    setLoadingMods(true)
    try {
      setMods(await api.mods.list(instance.id))
    } catch (error) {
      pushToast({ title: 'Could not read mods', description: errorMessage(error), variant: 'error' })
    } finally {
      setLoadingMods(false)
    }
  }

  useEffect(() => {
    void loadMods()
  }, [instance.id, modsTick])

  useEffect(() => {
    if (tab !== 'health') return
    void checkHealth()
  }, [tab, instance.id, modsTick])

  async function checkHealth(): Promise<void> {
    setHealthLoading(true)
    try {
      setHealth(await api.instances.health(instance.id))
    } catch (error) {
      pushToast({ title: 'Health check failed', description: errorMessage(error), variant: 'error' })
    } finally {
      setHealthLoading(false)
    }
  }

  async function repairInstance(): Promise<void> {
    setRepairing(true)
    try {
      await api.instances.repair(instance.id)
      pushToast({
        title: 'Repair started',
        description: 'Triad is checking the instance and downloading anything missing.',
        variant: 'success'
      })
      window.setTimeout(() => void checkHealth(), 1500)
    } catch (error) {
      pushToast({ title: 'Could not repair instance', description: errorMessage(error), variant: 'error' })
    } finally {
      setRepairing(false)
    }
  }

  async function toggleFavorite(): Promise<void> {
    try {
      const favorite = !instance.favorite
      await api.instances.update(instance.id, { favorite })
      setForm((current) => ({ ...current, favorite }))
      await refreshInstances()
    } catch (error) {
      pushToast({ title: 'Could not update favorite', description: errorMessage(error), variant: 'error' })
    }
  }

  async function exportInstance(): Promise<void> {
    setExporting(true)
    try {
      const path = await api.instances.export(instance.id)
      if (path) {
        pushToast({ title: 'Instance exported', description: path, variant: 'success' })
      }
    } catch (error) {
      pushToast({ title: 'Export failed', description: errorMessage(error), variant: 'error' })
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    void api.instances
      .worlds(instance.id)
      .then(setWorlds)
      .catch(() => setWorlds([]))
  }, [instance.id, modsTick])

  useEffect(() => {
    if (tab !== 'logs') return
    void api.launch.logs(instance.id).then(setLogs).catch(() => setLogs(''))
  }, [instance.id, tab, launch.status])

  useEffect(() => {
    if (tab !== 'settings') return
    void api.java
      .detect()
      .then(setJavas)
      .catch(() => setJavas([]))
  }, [tab])

  useEffect(() => {
    if (!confirmFile) return
    const timer = window.setTimeout(() => setConfirmFile(null), 4000)
    return () => window.clearTimeout(timer)
  }, [confirmFile])

  async function toggleMod(mod: InstalledMod): Promise<void> {
    const next = !mod.enabled
    setMods((current) =>
      current.map((entry) => (entry.fileName === mod.fileName ? { ...entry, enabled: next } : entry))
    )
    try {
      await api.mods.setEnabled(instance.id, mod.fileName, next)
    } catch (error) {
      setMods((current) =>
        current.map((entry) =>
          entry.fileName === mod.fileName ? { ...entry, enabled: mod.enabled } : entry
        )
      )
      pushToast({ title: 'Could not change mod state', description: errorMessage(error), variant: 'error' })
    }
  }

  async function removeMod(mod: InstalledMod): Promise<void> {
    try {
      await api.mods.remove(instance.id, mod.fileName)
      setMods((current) => current.filter((entry) => entry.fileName !== mod.fileName))
      setConfirmFile(null)
      pushToast({ title: 'Mod removed', description: mod.title, variant: 'success' })
    } catch (error) {
      pushToast({ title: 'Could not remove mod', description: errorMessage(error), variant: 'error' })
    }
  }

  async function checkUpdates(): Promise<void> {
    setChecking(true)
    try {
      const found = await api.mods.checkUpdates(instance.id)
      setUpdates(found)
      pushToast({
        title: found.length ? `${found.length} updates available` : 'Everything is up to date',
        description: found.length ? 'Review them in the mods list.' : undefined,
        variant: found.length ? 'default' : 'success'
      })
    } catch (error) {
      pushToast({ title: 'Update check failed', description: errorMessage(error), variant: 'error' })
    } finally {
      setChecking(false)
    }
  }

  async function applyUpdate(update: ModUpdate): Promise<void> {
    try {
      await api.mods.applyUpdate(instance.id, update)
      setUpdates((current) => current.filter((entry) => entry.projectId !== update.projectId))
      pushToast({ title: `Updating ${update.title}`, description: `→ ${update.latestNumber}` })
    } catch (error) {
      pushToast({ title: 'Update failed', description: errorMessage(error), variant: 'error' })
    }
  }

  async function applyAllUpdates(): Promise<void> {
    for (const update of updates) {
      await api.mods.applyUpdate(instance.id, update)
    }
    setUpdates([])
    pushToast({ title: 'Updates queued', description: 'Mods are being replaced in the background.' })
  }

  async function importJars(files: FileList | null): Promise<void> {
    const selected = files ? Array.from(files) : []
    if (!selected.length) return
    if (instance.loader === 'vanilla') {
      pushToast({
        title: 'This instance cannot load mods',
        description: 'Create a Fabric, Quilt, Forge or NeoForge instance first.',
        variant: 'error'
      })
      return
    }
    setImporting(true)
    try {
      const imported = await api.mods.importJar(instance.id, selected)
      if (!imported.length) return
      await loadMods()
      pushToast({
        title: imported.length === 1 ? 'Mod added' : `${imported.length} mods added`,
        description: `${imported.join(', ')} will load the next time you start Minecraft.`,
        variant: 'success'
      })
    } catch (error) {
      pushToast({ title: 'Could not add mod', description: errorMessage(error), variant: 'error' })
    } finally {
      setImporting(false)
      if (modInputRef.current) modInputRef.current.value = ''
    }
  }

  function openBrowseForMods(): void {
    setActiveInstance(instance.id)
    setBrowse({
      projectType: 'mod',
      query: '',
      gameVersion: instance.mcVersion,
      loader: instance.loader === 'vanilla' ? '' : instance.loader,
      category: ''
    })
    navigate('browse')
  }

  function openPerformanceKit(): void {
    setActiveInstance(instance.id)
    navigate('performance')
  }

  async function saveSettings(): Promise<void> {
    setSaving(true)
    try {
      await api.instances.update(instance.id, {
        name: form.name,
        memoryMb: form.memoryMb,
        javaPath: form.javaPath,
        jvmArgs: form.jvmArgs,
        notes: form.notes,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        group: form.group,
        favorite: form.favorite
      })
      await refreshInstances()
      pushToast({ title: 'Instance saved', variant: 'success' })
    } catch (error) {
      pushToast({ title: 'Could not save', description: errorMessage(error), variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function duplicate(): Promise<void> {
    try {
      const copy = await api.instances.duplicate(instance.id)
      await refreshInstances()
      openInstance(copy.id)
      pushToast({ title: 'Instance duplicated', description: `Created ${copy.name}.`, variant: 'success' })
    } catch (error) {
      pushToast({ title: 'Could not duplicate', description: errorMessage(error), variant: 'error' })
    }
  }

  async function addServer(event: FormEvent): Promise<void> {
    event.preventDefault()
    setServerSaving(true)
    try {
      await api.instances.addServer(instance.id, {
        name: serverName,
        address: serverAddress
      })
      await refreshInstances()
      setServerName('')
      setServerAddress('')
      pushToast({ title: 'Server saved', description: 'You can join it in one click.', variant: 'success' })
    } catch (error) {
      pushToast({ title: 'Could not add server', description: errorMessage(error), variant: 'error' })
    } finally {
      setServerSaving(false)
    }
  }

  async function removeServer(address: string): Promise<void> {
    try {
      await api.instances.removeServer(instance.id, address)
      await refreshInstances()
      pushToast({ title: 'Server removed', description: address })
    } catch (error) {
      pushToast({ title: 'Could not remove server', description: errorMessage(error), variant: 'error' })
    }
  }

  function requestDelete(): void {
    if (settings.confirmDelete) setDeleteOpen(true)
    else void removeInstance()
  }

  async function removeInstance(): Promise<void> {
    try {
      await api.instances.remove(instance.id)
      await refreshInstances()
      navigate('library')
      pushToast({ title: 'Instance deleted', description: instance.name })
    } catch (error) {
      pushToast({ title: 'Could not delete', description: errorMessage(error), variant: 'error' })
    }
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'mods', label: 'Mods', count: mods.length },
    { id: 'worlds', label: 'Worlds', count: worlds.length },
    { id: 'servers', label: 'Multiplayer', count: instance.servers?.length },
    { id: 'health', label: 'Health' },
    { id: 'logs', label: 'Logs' },
    { id: 'settings', label: 'Settings' }
  ]

  return (
    <div className="page detail-page">
      <button type="button" className="back-link" onClick={() => navigate('library')}>
        <ArrowLeft size={14} /> {t('nav.library')}
      </button>

      <Glass className="detail-hero">
        <div
          className="detail-icon"
          style={{
            background: `linear-gradient(145deg, color-mix(in srgb, ${instance.tint} 55%, transparent), rgb(255 255 255 / 0.05))`
          }}
        >
          {instance.icon.startsWith('http') ? <img src={instance.icon} alt="" /> : instance.icon}
        </div>
        <div className="detail-copy">
          <div className="eyebrow">
            {loaderLabel(instance.loader)} instance
            {instance.modpackProjectId ? ' · modpack' : ''}
          </div>
          <h1>{instance.name}</h1>
          <div className="hero-chips">
            <Chip tone="accent">Minecraft {instance.mcVersion}</Chip>
            <Chip>{loaderLabel(instance.loader)}</Chip>
            {instance.loaderVersion && <Chip>{instance.loaderVersion}</Chip>}
            <Chip tone="muted">{playtime(instance.playtimeMs)} played</Chip>
            {instance.group && <Chip tone="muted">📁 {instance.group}</Chip>}
            {(instance.tags ?? []).map((tag) => (
              <Chip key={tag} tone="muted">
                #{tag}
              </Chip>
            ))}
          </div>
          <span className="detail-last">
            <Clock size={12} /> Last played {relativeTime(instance.lastPlayed)}
          </span>
        </div>
        <div className="detail-actions">
          {running ? (
            <button type="button" className="play-btn play-btn--stop" onClick={stopGame}>
              <Square size={14} fill="currentColor" /> Stop
            </button>
          ) : (
            <button
              type="button"
              className="play-btn play-btn--sm"
              disabled={launchBusy}
              onClick={() => playInstance(instance.id)}
            >
              <Play size={15} fill="currentColor" /> Play
            </button>
          )}
          <button
            type="button"
            className={cn('icon-btn', instance.favorite && 'icon-btn--favorite')}
            title={instance.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => void toggleFavorite()}
          >
            <Star size={17} fill={instance.favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Export instance as .triadpack"
            disabled={exporting}
            onClick={() => void exportInstance()}
          >
            {exporting ? <Spinner size={16} /> : <Download size={17} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Open instance folder"
            onClick={() => void api.instances.openFolder(instance.id)}
          >
            <FolderOpen size={17} />
          </button>
          <button type="button" className="icon-btn" title="Duplicate instance" onClick={() => void duplicate()}>
            <Copy size={16} />
          </button>
        </div>
      </Glass>

      <div className="tabs detail-tabs" role="tablist">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={cn('tab', tab === entry.id && 'active')}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            {entry.count !== undefined && entry.count > 0 && (
              <span className="tab-count">{entry.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="detail-grid">
          <Glass className="detail-panel">
            <header className="panel-head">
              <h3>At a glance</h3>
            </header>
            <dl className="kv">
              <div>
                <dt>Minecraft</dt>
                <dd>{instance.mcVersion}</dd>
              </div>
              <div>
                <dt>Loader</dt>
                <dd>{loaderLabel(instance.loader)}</dd>
              </div>
              <div>
                <dt>Loader build</dt>
                <dd>{instance.loaderVersion ?? '—'}</dd>
              </div>
              <div>
                <dt>Memory</dt>
                <dd>{instance.memoryMb ?? 4096} MB</dd>
              </div>
              <div>
                <dt>Java</dt>
                <dd className="mono">{instance.javaPath ? fileName(instance.javaPath) : 'Automatic'}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{new Date(instance.created).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt>Playtime</dt>
                <dd>{playtime(instance.playtimeMs)}</dd>
              </div>
              <div>
                <dt>Last session</dt>
                <dd>{relativeTime(instance.lastPlayed)}</dd>
              </div>
            </dl>
            {instance.notes && <p className="instance-notes">{instance.notes}</p>}
          </Glass>

          <Glass className="detail-panel">
            <header className="panel-head">
              <h3>Installed mods</h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTab('mods')}>
                View all
              </button>
            </header>
            {loadingMods ? (
              <div className="panel-loading">
                <Spinner size={15} /> Reading mods…
              </div>
            ) : mods.length === 0 ? (
              <div className="mini-empty-state">
                <Puzzle size={18} />
                <p>No mods yet.</p>
                <button type="button" className="btn btn-sm" onClick={openBrowseForMods}>
                  <Plus size={13} /> Find mods
                </button>
              </div>
            ) : (
              <div className="mod-mini-list">
                {mods.slice(0, 5).map((mod) => (
                  <div key={mod.fileName} className="mod-mini">
                    <div className="mod-icon mod-icon--sm">
                      {mod.iconUrl ? <img src={mod.iconUrl} alt="" /> : <Puzzle size={15} />}
                    </div>
                    <div className="mod-mini-copy">
                      <strong>{mod.title}</strong>
                      <span>{mod.versionNumber ?? mod.fileName}</span>
                    </div>
                    {!mod.enabled && <Chip tone="muted">Off</Chip>}
                  </div>
                ))}
                {mods.length > 5 && <span className="muted small">+{mods.length - 5} more</span>}
              </div>
            )}
          </Glass>

          <Glass className="detail-panel">
            <header className="panel-head">
              <h3>Worlds</h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTab('worlds')}>
                View all
              </button>
            </header>
            {worlds.length === 0 ? (
              <div className="mini-empty-state">
                <span className="empty-emoji">🌍</span>
                <p>No worlds yet — launch the game to create one.</p>
              </div>
            ) : (
              <div className="world-mini-list">
                {worlds.slice(0, 3).map((world) => (
                  <div key={world.folder} className="world-mini">
                    <span className="world-emoji">🌍</span>
                    <div>
                      <strong>{world.name}</strong>
                      <span>{relativeTime(world.lastPlayed)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Glass>

          {performanceKit.length > 0 && (
            <Glass className="detail-panel performance-kit-panel">
              <header className="panel-head">
                <h3>Performance kit</h3>
                <button type="button" className="btn btn-sm" onClick={openPerformanceKit}>
                  <Gauge size={13} /> Manage
                </button>
              </header>
              {loadingMods ? (
                <div className="panel-loading">
                  <Spinner size={15} /> Checking recommended mods…
                </div>
              ) : (
                <>
                  <div className="performance-kit-summary">
                    <div>
                      <div className="performance-kit-count">
                        <strong>{performanceInstalled}</strong>
                        <span>/ {performanceKit.length}</span>
                      </div>
                      <span className="performance-kit-caption">recommended mods installed</span>
                    </div>
                    <Chip tone={performanceComplete ? 'ok' : 'muted'}>
                      {performanceComplete ? 'Complete' : `${performanceMissing} missing`}
                    </Chip>
                  </div>
                  <ProgressBar
                    value={performanceKit.length > 0 ? performanceInstalled / performanceKit.length : 0}
                  />
                  <div className="performance-kit-list" aria-label="Recommended performance mods">
                    {performanceKit.slice(0, 12).map((entry) => {
                      const installedMod = entry.installedMod
                      return (
                        <span
                          key={entry.projectId}
                          className={cn(
                            'performance-kit-item',
                            installedMod && 'is-installed',
                            installedMod && !installedMod.enabled && 'is-disabled'
                          )}
                          title={
                            installedMod
                              ? `${entry.title} installed${installedMod.enabled ? '' : ' (disabled)'}`
                              : `${entry.title} is not installed`
                          }
                        >
                          {installedMod ? <Check size={11} /> : <span className="performance-kit-dot" />}
                          <span>{entry.title}</span>
                          {installedMod && !installedMod.enabled && <em>off</em>}
                        </span>
                      )
                    })}
                    {performanceKit.length > 12 && (
                      <span className="performance-kit-item performance-kit-more">
                        +{performanceKit.length - 12} more
                      </span>
                    )}
                  </div>
                  <p className="performance-kit-foot">
                    {performanceComplete
                      ? performanceDisabled > 0
                        ? `${performanceDisabled} installed ${performanceDisabled === 1 ? 'mod is' : 'mods are'} disabled and will not contribute until enabled.`
                        : 'Every recommended mod for this loader is installed.'
                      : `${performanceMissing} recommended ${performanceMissing === 1 ? 'mod is' : 'mods are'} not installed yet. Open the Performance tab to add the kit.`}
                  </p>
                </>
              )}
            </Glass>
          )}

          <Glass className="detail-panel detail-panel--log">
            <header className="panel-head">
              <h3>Last launch</h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTab('logs')}>
                Open logs
              </button>
            </header>
            <pre className="log-view log-view--preview">{logs || 'No log recorded yet.'}</pre>
          </Glass>
        </div>
      )}

      {tab === 'mods' && (
        <Glass className="tab-panel">
          <input
            ref={modInputRef}
            type="file"
            accept=".jar,application/java-archive"
            multiple
            hidden
            onChange={(event) => void importJars(event.currentTarget.files)}
          />
          <div className="tab-toolbar">
            <div className="search-box">
              <Search size={14} />
              <input
                value={modQuery}
                onChange={(event) => setModQuery(event.target.value)}
                placeholder="Filter mods…"
              />
            </div>
            <span className="muted small count-label">
              {mods.length} {mods.length === 1 ? 'mod' : 'mods'} · {mods.filter((mod) => mod.enabled).length} enabled
            </span>
            <div className="page-actions">
              <button
                type="button"
                className="btn btn-sm"
                disabled={checking || !mods.some((mod) => mod.projectId)}
                onClick={() => void checkUpdates()}
              >
                {checking ? <Spinner size={13} /> : <RefreshCw size={13} />}
                {checking ? 'Checking…' : 'Check updates'}
              </button>
              {instance.loader !== 'vanilla' && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={importing}
                  onClick={() => modInputRef.current?.click()}
                >
                  {importing ? <Spinner size={13} /> : <Upload size={13} />}
                  {importing ? 'Adding…' : 'Add .jar'}
                </button>
              )}
              <button type="button" className="btn btn-sm btn-primary" onClick={openBrowseForMods}>
                <Plus size={13} /> Add mods
              </button>
            </div>
          </div>

          {updates.length > 0 && (
            <div className="update-banner">
              <div>
                <strong>{updates.length} updates available</strong>
                <span>Latest versions compatible with {instance.mcVersion}.</span>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => void applyAllUpdates()}>
                Update all
              </button>
            </div>
          )}

          {loadingMods ? (
            <div className="panel-loading">
              <Spinner size={16} /> Reading the mods folder…
            </div>
          ) : mods.length === 0 ? (
            <EmptyState
              icon={<Puzzle size={22} />}
              title="No mods installed"
              description={
                instance.loader === 'vanilla'
                  ? 'This instance is vanilla. Create a Fabric, Quilt, Forge or NeoForge instance to load mods.'
                  : 'Browse the catalogue and install mods with their required dependencies in one click.'
              }
              action={
                <div className="page-actions">
                  <button type="button" className="btn btn-primary" onClick={openBrowseForMods}>
                    <Plus size={14} /> Browse mods
                  </button>
                  {instance.loader !== 'vanilla' && (
                    <button
                      type="button"
                      className="btn"
                      disabled={importing}
                      onClick={() => modInputRef.current?.click()}
                    >
                      <Upload size={14} /> Add .jar
                    </button>
                  )}
                </div>
              }
            />
          ) : (
            <div className="mod-list">
              {filteredMods.map((mod) => {
                const update = mod.projectId ? updatesByProject.get(mod.projectId) : undefined
                return (
                  <div key={mod.fileName} className={cn('mod-row', !mod.enabled && 'is-disabled')}>
                    <div className="mod-icon">
                      {mod.iconUrl ? <img src={mod.iconUrl} alt="" loading="lazy" /> : <Puzzle size={18} />}
                    </div>
                    <div className="mod-copy">
                      <div className="mod-title-line">
                        <strong>{mod.title}</strong>
                        {mod.source === 'modpack' && <Chip tone="muted">modpack</Chip>}
                        {!mod.enabled && <Chip tone="muted">disabled</Chip>}
                      </div>
                      <span className="mod-meta">
                        {mod.versionNumber ? `v${mod.versionNumber.replace(/^v/, '')}` : 'local file'} ·{' '}
                        {bytes(mod.size)}
                      </span>
                      <span className="mod-file">{mod.fileName}</span>
                    </div>
                    {update && (
                      <button
                        type="button"
                        className="btn btn-sm btn-accent-soft"
                        onClick={() => void applyUpdate(update)}
                      >
                        Update {update.latestNumber}
                      </button>
                    )}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={mod.enabled}
                      aria-label={`${mod.enabled ? 'Disable' : 'Enable'} ${mod.title}`}
                      className={cn('toggle', mod.enabled && 'on')}
                      onClick={() => void toggleMod(mod)}
                    >
                      <span className="toggle-knob" />
                    </button>
                    <button
                      type="button"
                      className={cn('icon-btn', confirmFile === mod.fileName && 'icon-btn--danger')}
                      title={confirmFile === mod.fileName ? 'Click again to delete' : 'Remove mod'}
                      onClick={() => {
                        if (confirmFile === mod.fileName) void removeMod(mod)
                        else setConfirmFile(mod.fileName)
                      }}
                    >
                      {confirmFile === mod.fileName ? <Check size={15} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                )
              })}
              {filteredMods.length === 0 && <p className="muted">No mod matches “{modQuery}”.</p>}
            </div>
          )}
        </Glass>
      )}

      {tab === 'worlds' && (
        <Glass className="tab-panel">
          <div className="tab-toolbar">
            <div>
              <h3 className="panel-title">Saved worlds</h3>
              <span className="muted small">{worlds.length} in this instance</span>
            </div>
            <div className="page-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void api.instances.openSaves(instance.id)}
              >
                <FolderOpen size={13} /> Open saves
              </button>
            </div>
          </div>
          {worlds.length === 0 ? (
            <EmptyState
              icon={<span className="empty-emoji">🌍</span>}
              title="No worlds yet"
              description="Launch this instance and create a world — it will appear here with its last played time."
              action={
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={launchBusy}
                  onClick={() => playInstance(instance.id)}
                >
                  <Play size={14} /> Launch Minecraft
                </button>
              }
            />
          ) : (
            <div className="world-grid">
              {worlds.map((world) => (
                <Glass key={world.folder} className="world-card" flat>
                  <span className="world-emoji">🌍</span>
                  <div className="world-copy">
                    <strong>{world.name}</strong>
                    <span>
                      Last played {relativeTime(world.lastPlayed)}
                      {quickPlayWorlds && <em className="quick-play-badge">Quick play</em>}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary world-play"
                    disabled={launchBusy}
                    title={quickPlayWorlds ? 'Launch straight into this world' : 'Launch this instance'}
                    onClick={() => playInstance(instance.id, undefined, world.folder)}
                  >
                    <Play size={12} fill="currentColor" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--xs"
                    title="Open saves folder"
                    onClick={() => void api.instances.openSaves(instance.id)}
                  >
                    <FolderOpen size={14} />
                  </button>
                </Glass>
              ))}
            </div>
          )}
        </Glass>
      )}

      {tab === 'servers' && (
        <div className="detail-grid server-grid">
          <Glass className="detail-panel">
            <header className="panel-head">
              <h3>Your servers</h3>
              <Chip tone="muted">{servers.length} saved</Chip>
            </header>
            {servers.length === 0 ? (
              <div className="mini-empty-state server-empty">
                <Server size={22} />
                <p>No servers yet. Add an address and Triad will launch straight into it.</p>
              </div>
            ) : (
              <div className="server-list">
                {servers.map((server) => (
                  <div className="server-row" key={server.address}>
                    <span className="server-mark">
                      <Server size={16} />
                    </span>
                    <div className="server-copy">
                      <strong>{server.name}</strong>
                      <span className="mono">{server.address}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={launchBusy}
                      onClick={() => playInstance(instance.id, server.address)}
                    >
                      <Play size={12} fill="currentColor" /> Join
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title={`Remove ${server.name}`}
                      onClick={() => void removeServer(server.address)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="server-hint">
              Joining launches Minecraft and connects directly — no need to type the address again.
            </p>
          </Glass>

          <Glass className="detail-panel">
            <header className="panel-head">
              <h3>Add a server</h3>
            </header>
            <form className="server-form" onSubmit={(event) => void addServer(event)}>
              <div className="field">
                <label className="field-label" htmlFor="server-name">
                  Name <span className="muted">(optional)</span>
                </label>
                <input
                  id="server-name"
                  className="input"
                  value={serverName}
                  maxLength={48}
                  placeholder="SMP with friends"
                  onChange={(event) => setServerName(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="server-address">
                  Server address
                </label>
                <input
                  id="server-address"
                  className="input mono"
                  value={serverAddress}
                  maxLength={260}
                  placeholder="play.example.net or 203.0.113.7:25565"
                  spellCheck={false}
                  onChange={(event) => setServerAddress(event.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={serverSaving || serverAddress.trim().length < 3}
              >
                {serverSaving ? <Spinner size={14} /> : <Plus size={14} />}
                {serverSaving ? 'Saving…' : 'Save server'}
              </button>
            </form>

            <div className={cn('server-account-note', account?.type === 'offline' && 'is-warning')}>
              {!account
                ? 'Choose a profile before joining a server.'
                : account.type === 'microsoft'
                  ? 'Signed in with Microsoft — public online servers will recognize your account.'
                  : 'Offline profile: public online-mode servers will reject this login. Use Microsoft sign-in for those.'}
            </div>
            <p className="field-hint">
              The server must run the same Minecraft version and mod loader as this instance.
            </p>
          </Glass>
        </div>
      )}

      {tab === 'health' && (
        <div className="health-layout">
          <Glass className={cn('health-hero', health && `health-hero--${health.status}`)}>
            <div className="health-hero-icon">
              {health?.status === 'healthy' ? <Check size={24} /> : <ShieldCheck size={24} />}
            </div>
            <div className="health-hero-copy">
              <span className="card-label">Instance health</span>
              <h3>
                {healthLoading
                  ? 'Checking files…'
                  : health?.status === 'healthy'
                    ? 'Everything looks ready'
                    : health?.status === 'attention'
                      ? 'A little attention needed'
                      : health
                        ? 'This instance needs a repair'
                        : 'Run a health check'}
              </h3>
              <p>
                {health
                  ? `${health.checks.filter((check) => check.status === 'ok').length}/${health.checks.length} checks passed · checked ${relativeTime(health.checkedAt)}`
                  : 'Check game files, mods, Java and worlds before launching.'}
              </p>
            </div>
            <div className="health-hero-actions">
              <button type="button" className="btn btn-sm" disabled={healthLoading} onClick={() => void checkHealth()}>
                {healthLoading ? <Spinner size={13} /> : <RefreshCw size={13} />} Run check
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={repairing}
                onClick={() => void repairInstance()}
              >
                {repairing ? <Spinner size={13} /> : <ShieldCheck size={13} />}
                {repairing ? 'Repairing…' : 'Repair / download'}
              </button>
            </div>
          </Glass>

          <div className="health-checks">
            {health?.checks.map((check) => (
              <Glass key={check.id} className={cn('health-check', `health-check--${check.status}`)} flat>
                <span className="health-check-icon">
                  {check.status === 'ok' ? (
                    <Check size={15} />
                  ) : check.status === 'warn' ? (
                    <CircleAlert size={15} />
                  ) : (
                    <CircleAlert size={15} />
                  )}
                </span>
                <div className="health-check-copy">
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </div>
                {check.fixable && <span className="health-fixable">repairable</span>}
              </Glass>
            ))}
            {!health && !healthLoading && (
              <Glass className="health-empty" flat>
                <ShieldCheck size={20} /> Run a check to see what needs attention.
              </Glass>
            )}
          </div>

          <Glass className="health-tip" flat>
            <span className="health-tip-icon">💡</span>
            <p>
              Repair recreates missing folders, clears stale mod records and downloads missing game
              files. Your worlds, mods and configs are never deleted.
            </p>
          </Glass>
        </div>
      )}

      {tab === 'logs' && (
        <Glass className="tab-panel">
          <div className="tab-toolbar">
            <div>
              <h3 className="panel-title">Launch log</h3>
              <span className="muted small">Output from this session or latest.log</span>
            </div>
            <div className="page-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void api.launch.logs(instance.id).then(setLogs)}
              >
                <RefreshCw size={13} /> Refresh
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void api.instances.openFolder(instance.id)}
              >
                <FolderOpen size={13} /> Folder
              </button>
            </div>
          </div>
          <pre className="log-view">{logs || 'No log output yet. Launch the game to populate this view.'}</pre>
        </Glass>
      )}

      {tab === 'settings' && (
        <div className="settings-form">
          <Glass className="detail-panel">
            <header className="panel-head">
              <h3>Instance configuration</h3>
              <button type="button" className="btn btn-sm" onClick={() => setTab('logs')}>
                <ScrollText size={13} /> Logs
              </button>
            </header>

            <div className="field">
              <label className="field-label" htmlFor="detail-name">
                Name
              </label>
              <input
                id="detail-name"
                className="input"
                value={form.name}
                maxLength={48}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>

            <div className="field">
              <span className="field-label">Allocated memory</span>
              <Slider
                value={form.memoryMb}
                min={1024}
                max={16384}
                step={512}
                suffix="MB"
                display={String(form.memoryMb)}
                onChange={(value) => setForm({ ...form, memoryMb: value })}
              />
              <p className="field-hint">
                Shared with Java. Leave headroom for Windows — 4–8 GB is plenty for most packs.
              </p>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="detail-java">
                Java executable
              </label>
              <input
                id="detail-java"
                className="input"
                value={form.javaPath}
                placeholder="Automatic — use the best installed runtime"
                onChange={(event) => setForm({ ...form, javaPath: event.target.value })}
              />
              <div className="java-chips">
                <button
                  type="button"
                  className={cn('tag tag--button', !form.javaPath && 'active')}
                  onClick={() => setForm({ ...form, javaPath: '' })}
                >
                  Automatic
                </button>
                {javas.map((java) => (
                  <button
                    key={java.path}
                    type="button"
                    className={cn('tag tag--button', form.javaPath === java.path && 'active')}
                    onClick={() => setForm({ ...form, javaPath: java.path })}
                    title={java.path}
                  >
                    <Cpu size={11} /> Java {java.major}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="detail-jvm">
                Extra JVM arguments
              </label>
              <input
                id="detail-jvm"
                className="input mono"
                value={form.jvmArgs}
                placeholder="-XX:+UseG1GC"
                onChange={(event) => setForm({ ...form, jvmArgs: event.target.value })}
              />
            </div>

            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="detail-group">
                  Folder / group
                </label>
                <input
                  id="detail-group"
                  className="input"
                  value={form.group}
                  maxLength={32}
                  placeholder="e.g. Adventure, Create, Co-op"
                  onChange={(event) => setForm({ ...form, group: event.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="detail-tags">
                  Tags <span className="muted">(comma separated)</span>
                </label>
                <input
                  id="detail-tags"
                  className="input"
                  value={form.tags}
                  maxLength={180}
                  placeholder="favorite, co-op, redstone"
                  onChange={(event) => setForm({ ...form, tags: event.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="detail-notes">
                Notes
              </label>
              <textarea
                id="detail-notes"
                className="input textarea"
                value={form.notes}
                maxLength={2000}
                rows={3}
                placeholder="What is this instance for?"
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>

            <Toggle
              label="Pin to favorites"
              checked={form.favorite}
              onChange={(favorite) => setForm({ ...form, favorite })}
            />

            <div className="panel-actions">
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveSettings()}>
                {saving ? <Spinner size={14} /> : null}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </Glass>

          <Glass className="detail-panel">
            <header className="panel-head">
              <h3>Maintenance</h3>
            </header>
            <div className="setting-action">
              <div>
                <strong>Open instance folder</strong>
                <span>Mods, saves, resource packs and configs.</span>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void api.instances.openFolder(instance.id)}
              >
                <FolderOpen size={13} /> Open
              </button>
            </div>
            <div className="setting-action">
              <div>
                <strong>Duplicate instance</strong>
                <span>Copy worlds, mods and settings to a new folder.</span>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => void duplicate()}>
                <Copy size={13} /> Duplicate
              </button>
            </div>
            <div className="setting-action">
              <div>
                <strong>Export instance</strong>
                <span>Save mods, configs and worlds as a portable .triadpack.</span>
              </div>
              <button type="button" className="btn btn-sm" disabled={exporting} onClick={() => void exportInstance()}>
                {exporting ? <Spinner size={13} /> : <Download size={13} />}
                {exporting ? 'Exporting…' : 'Export'}
              </button>
            </div>
            <div className="setting-action">
              <div>
                <strong>Check health</strong>
                <span>Verify game files, mods, Java and worlds.</span>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setTab('health')}>
                <ShieldCheck size={13} /> Health
              </button>
            </div>
            <div className="setting-action">
              <div>
                <strong>Worlds</strong>
                <span>{worlds.length} saved worlds in this instance.</span>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void api.instances.openSaves(instance.id)}
              >
                <FolderOpen size={13} /> Saves
              </button>
            </div>

            <div className="danger-zone">
              <div>
                <strong>Delete instance</strong>
                <span>Removes this instance, its worlds and mods. Shared game files stay.</span>
              </div>
              <button type="button" className="btn btn-danger btn-sm" onClick={requestDelete}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </Glass>
        </div>
      )}

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} className="confirm-modal" label="Delete instance">
        <ModalHeader
          title={`Delete ${instance.name}?`}
          subtitle="This cannot be undone."
          onClose={() => setDeleteOpen(false)}
          icon={<Trash2 size={18} />}
        />
        <div className="modal-body">
          <p className="confirm-copy">
            All worlds, mods, configs and playtime for this instance will be removed. Minecraft game
            files shared with other instances are kept.
          </p>
          <div className="confirm-summary">
            <span>{mods.length} mods</span>
            <span>{worlds.length} worlds</span>
            <span>{playtime(instance.playtimeMs)} played</span>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={() => setDeleteOpen(false)}>
            Keep instance
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void removeInstance()}>
            <Trash2 size={14} /> Delete forever
          </button>
        </div>
      </Modal>
    </div>
  )
}
