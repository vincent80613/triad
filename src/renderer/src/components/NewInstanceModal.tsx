import { useEffect, useState } from 'react'
import { Gamepad2, Sparkles } from 'lucide-react'
import type { LoaderType, LoaderVersion, McVersion } from '@shared/types'
import { useApp } from '../store'
import { cn } from '../lib/format'
import { api, errorMessage } from '../api'
import { Field, Select, Slider, Spinner } from './Controls'
import { Modal, ModalHeader } from './Modal'

const ICONS = ['🌿', '⚔️', '🏰', '🔥', '❄️', '🌌', '⛏️', '🐉', '🧪', '🌊', '🍄', '🪐']
const TINTS = ['#8f7bff', '#4ea1ff', '#45e6a8', '#ff8a5c', '#ff9ec9', '#f5c451', '#b6ff3d', '#c4b5fd']

interface Template {
  id: string
  name: string
  blurb: string
  icon: string
  tint: string
  loader: LoaderType
  version?: string
  memoryMb?: number
}

const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Custom',
    blurb: 'Start from scratch',
    icon: '🌿',
    tint: '#8f7bff',
    loader: 'fabric'
  },
  {
    id: 'performance',
    name: 'Performance',
    blurb: 'Sodium-ready Fabric',
    icon: '⚡',
    tint: '#b6ff3d',
    loader: 'fabric',
    memoryMb: 4096
  },
  {
    id: 'create',
    name: 'Create',
    blurb: 'Forge 1.20.1 workshop',
    icon: '⚙️',
    tint: '#f5c451',
    loader: 'forge',
    version: '1.20.1',
    memoryMb: 6144
  },
  {
    id: 'skyblock',
    name: 'Skyblock',
    blurb: 'Fabric island life',
    icon: '☁️',
    tint: '#4ea1ff',
    loader: 'fabric',
    memoryMb: 4096
  },
  {
    id: 'vanilla',
    name: 'Vanilla+',
    blurb: 'Clean latest release',
    icon: '🧭',
    tint: '#45e6a8',
    loader: 'vanilla',
    memoryMb: 4096
  },
  {
    id: 'horror',
    name: 'Horror',
    blurb: 'Forge 1.20.1 nights',
    icon: '🕯️',
    tint: '#ff8a5c',
    loader: 'forge',
    version: '1.20.1',
    memoryMb: 6144
  }
]

const LOADERS: { value: LoaderType; label: string }[] = [
  { value: 'vanilla', label: 'Vanilla' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'quilt', label: 'Quilt' },
  { value: 'forge', label: 'Forge' },
  { value: 'neoforge', label: 'NeoForge' }
]

export function NewInstanceModal() {
  const open = useApp((state) => state.newInstanceOpen)
  const setOpen = useApp((state) => state.setNewInstanceOpen)
  const openInstance = useApp((state) => state.openInstance)
  const pushToast = useApp((state) => state.pushToast)
  const defaultMemory = useApp((state) => state.settings.memoryMb)
  const [template, setTemplate] = useState('blank')
  const [name, setName] = useState('New World')
  const [icon, setIcon] = useState('🌿')
  const [tint, setTint] = useState('#8f7bff')
  const [loader, setLoader] = useState<LoaderType>('fabric')
  const [mcVersion, setMcVersion] = useState('')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [versions, setVersions] = useState<McVersion[]>([])
  const [loaders, setLoaders] = useState<LoaderVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [loadingLoaders, setLoadingLoaders] = useState(false)
  const [creating, setCreating] = useState(false)
  const [memoryMb, setMemoryMb] = useState(defaultMemory)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setCreating(false)
    setLoadingVersions(true)
    setTemplate('blank')
    setMemoryMb(defaultMemory)
    setName('New World')
    void api.versions
      .list()
      .then((list) => {
        setVersions(list)
        setMcVersion((current) => current || list[0]?.id || '')
      })
      .catch((loadError) => setError(errorMessage(loadError)))
      .finally(() => setLoadingVersions(false))
  }, [open, defaultMemory])

  function chooseTemplate(next: Template): void {
    setTemplate(next.id)
    setName(next.id === 'blank' ? 'New World' : next.name)
    setIcon(next.icon)
    setTint(next.tint)
    setLoader(next.loader)
    setMemoryMb(next.memoryMb ?? defaultMemory)
    if (next.version) {
      setMcVersion(next.version)
    } else if (versions[0]) {
      setMcVersion(versions[0].id)
    }
  }

  useEffect(() => {
    if (!open || !mcVersion || loader === 'vanilla') {
      setLoaders([])
      setLoaderVersion('')
      return
    }
    let cancelled = false
    setLoadingLoaders(true)
    setLoaderVersion('')
    void api.versions
      .loaders(mcVersion, loader)
      .then((list) => {
        if (cancelled) return
        setLoaders(list)
        setLoaderVersion(list[0]?.version ?? '')
      })
      .catch(() => {
        if (!cancelled) setLoaders([])
      })
      .finally(() => {
        if (!cancelled) setLoadingLoaders(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, mcVersion, loader])

  async function create(): Promise<void> {
    if (!name.trim()) {
      setError('Give your instance a name.')
      return
    }
    if (!mcVersion) {
      setError('Choose a Minecraft version.')
      return
    }
    setCreating(true)
    setError('')
    try {
      const result = await api.instances.create({
        name: name.trim(),
        icon,
        tint,
        mcVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? undefined : loaderVersion,
        memoryMb
      })
      setOpen(false)
      setCreating(false)
      openInstance(result.instance.id)
      pushToast({
        title: 'Instance created',
        description: 'Game files are downloading in the background.',
        variant: 'success'
      })
    } catch (createError) {
      setCreating(false)
      setError(errorMessage(createError))
    }
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} className="new-instance-modal" label="Create instance">
      <ModalHeader
        title="Create instance"
        subtitle="A fresh world with its own mods, saves and settings."
        onClose={() => setOpen(false)}
        icon={<Sparkles size={18} />}
      />
      <div className="modal-body">
        <div className="template-block">
          <span className="field-label">Start from a template</span>
          <div className="template-grid">
            {TEMPLATES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={cn('template-card', template === entry.id && 'active')}
                onClick={() => chooseTemplate(entry)}
              >
                <span className="template-icon" style={{ background: entry.tint }}>
                  {entry.icon}
                </span>
                <span className="template-copy">
                  <strong>{entry.name}</strong>
                  <span>{entry.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <Field label="Instance name" htmlFor="instance-name">
          <input
            id="instance-name"
            className="input"
            value={name}
            maxLength={48}
            onChange={(event) => setName(event.target.value)}
            placeholder="My modded world"
            autoFocus
          />
        </Field>

        <div className="field">
          <span className="field-label">Icon</span>
          <div className="emoji-grid">
            {ICONS.map((entry) => (
              <button
                key={entry}
                type="button"
                className={cn('emoji-option', entry === icon && 'active')}
                onClick={() => setIcon(entry)}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Accent</span>
          <div className="tint-row">
            {TINTS.map((entry) => (
              <button
                key={entry}
                type="button"
                className={cn('tint-dot', entry === tint && 'active')}
                style={{ background: entry }}
                onClick={() => setTint(entry)}
                aria-label={`Accent ${entry}`}
              />
            ))}
          </div>
        </div>

        <div className="form-grid">
          <Field label="Minecraft version">
            {loadingVersions ? (
              <div className="input loading-input">
                <Spinner size={14} /> Loading versions…
              </div>
            ) : versions.length ? (
              <Select value={mcVersion} onChange={setMcVersion} ariaLabel="Minecraft version">
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.id} {version.type !== 'release' ? `· ${version.type}` : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <input
                className="input"
                value={mcVersion}
                onChange={(event) => setMcVersion(event.target.value)}
                placeholder="1.21.1"
              />
            )}
          </Field>
          <Field label="Loader">
            <Select
              value={loader}
              onChange={(value) => setLoader(value as LoaderType)}
              ariaLabel="Mod loader"
            >
              {LOADERS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {loader !== 'vanilla' && (
          <Field label="Loader version" hint="The newest stable build is selected by default.">
            {loadingLoaders ? (
              <div className="input loading-input">
                <Spinner size={14} /> Finding loader builds…
              </div>
            ) : loaders.length ? (
              <Select value={loaderVersion} onChange={setLoaderVersion} ariaLabel="Loader version">
                {loaders.map((entry) => (
                  <option key={entry.version} value={entry.version}>
                    {entry.version} {entry.stable ? '· stable' : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="input loading-input muted">No loader build found for this version.</div>
            )}
          </Field>
        )}

        <Field label="Memory" hint="More memory helps large packs. Leave room for Windows.">
          <Slider
            value={memoryMb}
            min={1024}
            max={16384}
            step={512}
            display={String(memoryMb)}
            suffix="MB"
            onChange={setMemoryMb}
          />
        </Field>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-note">
          <Gamepad2 size={15} />
          <span>
            Minecraft game files, libraries and assets are shared across instances — only mods,
            saves and configs are kept per instance.
          </span>
        </div>
      </div>
      <div className="modal-foot">
        <span className="modal-foot-hint">
          {loader === 'vanilla' ? 'Vanilla' : `${loader} ${loaderVersion}`} · {mcVersion || '—'}
        </span>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={creating || loadingVersions || loadingLoaders || !mcVersion}
          onClick={() => void create()}
        >
          {creating ? <Spinner size={14} /> : <Sparkles size={14} />}
          {creating ? 'Creating…' : 'Create instance'}
        </button>
      </div>
    </Modal>
  )
}
