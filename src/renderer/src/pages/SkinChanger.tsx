import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ImagePlus,
  Palette,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound
} from 'lucide-react'
import type { SkinApplyResult, SkinVariant } from '@shared/types'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { cn } from '../lib/format'
import {
  getPresetData,
  getPresetSkins,
  SKIN_CATEGORIES,
  type SkinCategory,
  type SkinPreset
} from '../lib/skins'
import { Glass } from '../components/Glass'
import { Chip, Spinner } from '../components/Controls'
import { SkinAvatar } from '../components/SkinAvatar'
import { SkinPreview } from '../components/SkinPreview'

type SkinFilter = 'All' | SkinCategory

const INITIAL_VISIBLE = 48

interface SelectedSkin {
  id: string
  name: string
  category: SkinCategory
  variant: SkinVariant
  dataUrl: string
  isCustom?: boolean
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read that PNG image.'))
    image.src = src
  })
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not open that file.'))
    reader.readAsDataURL(file)
  })
}

export function SkinChanger() {
  const account = useApp((state) => state.account)
  const openAccount = useApp((state) => state.setAccountOpen)
  const openSkinStudio = useApp((state) => state.setSkinStudioOpen)
  const pushToast = useApp((state) => state.pushToast)
  const presets = useMemo<SkinPreset[]>(() => getPresetSkins(), [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<SkinFilter>('All')
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE)
  const [selectedId, setSelectedId] = useState(presets[0]?.id ?? '')
  const [custom, setCustom] = useState<SelectedSkin | null>(null)
  const [customVariant, setCustomVariant] = useState<SkinVariant>('classic')
  const [uploadError, setUploadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [applied, setApplied] = useState<{ skinId: string; result: SkinApplyResult } | null>(null)
  const signedIn = account?.type === 'microsoft'

  const selectedPreset = presets.find((preset) => preset.id === selectedId) ?? presets[0]
  const selected: SelectedSkin =
    custom && selectedId === custom.id
      ? { ...custom, variant: customVariant }
      : selectedPreset
        ? {
            id: selectedPreset.id,
            name: selectedPreset.name,
            category: selectedPreset.category,
            variant: selectedPreset.variant,
            dataUrl: getPresetData(selectedPreset)
          }
        : {
            id: 'wayfarer',
            name: 'Wayfarer',
            category: 'Classic',
            variant: 'classic',
            dataUrl: ''
          }

  const query = search.trim().toLowerCase()
  const filteredPresets = presets.filter((preset) => {
    const matchesFilter = filter === 'All' || preset.category === filter
    const matchesQuery =
      !query || `${preset.name} ${preset.category} ${preset.variant}`.toLowerCase().includes(query)
    return matchesFilter && matchesQuery
  })
  const visiblePresets = filteredPresets.slice(0, visibleLimit)
  const remaining = Math.max(0, filteredPresets.length - visiblePresets.length)
  const selectedApplied = applied?.skinId === selected.id ? applied.result : null

  useEffect(() => {
    setVisibleLimit(INITIAL_VISIBLE)
  }, [search, filter])

  async function onFile(file: File | undefined): Promise<void> {
    if (!file) return
    setUploadError('')
    try {
      if (!/\.png$/i.test(file.name) && file.type !== 'image/png') {
        throw new Error('Choose a PNG skin texture.')
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('That skin is too large (maximum 2 MB).')
      }
      const dataUrl = await readFile(file)
      const image = await loadImage(dataUrl)
      if (image.naturalWidth !== 64 || (image.naturalHeight !== 64 && image.naturalHeight !== 32)) {
        throw new Error('Use a 64×64 or legacy 64×32 Minecraft skin PNG.')
      }
      const next: SelectedSkin = {
        id: 'custom-upload',
        name: file.name.replace(/\.png$/i, '') || 'Custom skin',
        category: 'Classic',
        variant: customVariant,
        dataUrl,
        isCustom: true
      }
      setCustom(next)
      setSelectedId(next.id)
      setApplied(null)
      setApplyError('')
      pushToast({ title: 'Skin loaded', description: 'Choose the model, then apply it.', variant: 'success' })
    } catch (error) {
      setUploadError(errorMessage(error))
    }
  }

  async function applySkin(): Promise<void> {
    if (!signedIn) {
      openAccount(true)
      return
    }
    setBusy(true)
    setApplyError('')
    setApplied(null)
    try {
      const result = await api.skins.apply(selected.dataUrl, selected.variant)
      setApplied({ skinId: selected.id, result })
    } catch (error) {
      setApplyError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function choosePreset(preset: SkinPreset): void {
    setSelectedId(preset.id)
    setApplied(null)
    setApplyError('')
  }

  return (
    <div className="page skin-changer-page">
      <div className="page-header skin-changer-head">
        <div className="page-heading">
          <div className="eyebrow">
            <Sparkles size={11} /> Personalize
          </div>
          <h1 className="page-title">Skin Changer</h1>
          <p className="page-sub">
            Find a look you love, preview it, and apply it straight to your Minecraft account.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => openSkinStudio(true)}>
            <Palette size={14} /> Skin Studio
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} /> Upload skin
          </button>
        </div>
      </div>

      <div className="skin-changer-layout">
        <section className="skin-browser" aria-label="Skin catalogue">
          <div className="skin-browser-toolbar">
            <div className="skin-search-box">
              <Search size={14} />
              <input
                className="input"
                type="search"
                value={search}
                placeholder="Search skins…"
                aria-label="Search skins"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <span className="skin-result-count">
              {filteredPresets.length === presets.length
                ? `${presets.length} skins`
                : `${filteredPresets.length} of ${presets.length}`}
            </span>
          </div>

          <div className="skin-filter-row">
            {(['All', ...SKIN_CATEGORIES] as SkinFilter[]).map((category) => (
              <button
                key={category}
                type="button"
                className={cn('skin-filter', filter === category && 'active')}
                onClick={() => setFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {uploadError && (
            <div className="skin-upload-error" role="alert">
              <AlertTriangle size={14} /> {uploadError}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/png,.png"
            hidden
            onChange={(event) => {
              void onFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />

          <div className="skin-grid">
            <button
              type="button"
              className={cn('skin-upload-card', selected.isCustom && 'active')}
              onClick={() => fileRef.current?.click()}
            >
              <span className="skin-upload-mark">
                <ImagePlus size={22} />
              </span>
              <strong>{custom ? 'Replace upload' : 'Use your own'}</strong>
              <small>64×64 or 64×32 PNG</small>
            </button>

            {visiblePresets.map((preset) => {
              const active = selected.id === preset.id && !selected.isCustom
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={cn('skin-card', active && 'active')}
                  aria-pressed={active}
                  onClick={() => choosePreset(preset)}
                >
                  <span className="skin-card-visual">
                    <SkinPreview
                      src={getPresetData(preset)}
                      variant={preset.variant}
                      compact
                      className="skin-card-canvas"
                      label={`${preset.name} preview`}
                    />
                    {active && (
                      <span className="skin-card-check">
                        <Check size={12} />
                      </span>
                    )}
                    <span className="skin-card-model">{preset.variant}</span>
                  </span>
                  <span className="skin-card-copy">
                    <strong>{preset.name}</strong>
                    <span>{preset.category}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {remaining > 0 && (
            <div className="skin-load-more-row">
              <button
                type="button"
                className="btn skin-load-more"
                onClick={() => setVisibleLimit((value) => value + INITIAL_VISIBLE)}
              >
                Show {Math.min(INITIAL_VISIBLE, remaining)} more
                <span>{remaining} remaining</span>
              </button>
            </div>
          )}

          {filteredPresets.length === 0 && (
            <div className="skin-no-results">
              <Search size={20} />
              <strong>No skins match “{search}”</strong>
              <span>Try another search or category.</span>
            </div>
          )}
        </section>

        <aside className="skin-stage-card glass glass--strong" aria-label="Selected skin">
          <div className="skin-stage-top">
            <span className="skin-stage-kicker">
              <span className="live-dot" /> Live preview
            </span>
            <span className="skin-stage-number">{presets.length} ready to wear</span>
          </div>

          <div className="skin-stage-visual">
            <span className="skin-stage-halo" />
            <span className="skin-stage-orbit skin-stage-orbit--one" />
            <span className="skin-stage-orbit skin-stage-orbit--two" />
            <SkinPreview
              src={selected.dataUrl}
              variant={selected.variant}
              className="skin-stage-canvas"
              label={`Selected skin: ${selected.name}`}
            />
            <span className="skin-stage-floor" />
          </div>

          <div className="skin-stage-copy">
            <div className="skin-stage-title-row">
              <div>
                <span className="skin-stage-overline">{selected.isCustom ? 'Your upload' : selected.category}</span>
                <h2>{selected.name}</h2>
              </div>
              <Chip tone="muted">{selected.variant === 'slim' ? 'Slim' : 'Classic'}</Chip>
            </div>

            {selected.isCustom && (
              <div className="skin-model-picker">
                <span>Arm model</span>
                <div className="segmented">
                  <button
                    type="button"
                    className={cn(customVariant === 'classic' && 'active')}
                    aria-pressed={customVariant === 'classic'}
                    onClick={() => setCustomVariant('classic')}
                  >
                    Classic
                  </button>
                  <button
                    type="button"
                    className={cn(customVariant === 'slim' && 'active')}
                    aria-pressed={customVariant === 'slim'}
                    onClick={() => setCustomVariant('slim')}
                  >
                    Slim
                  </button>
                </div>
              </div>
            )}

            <div className={cn('skin-account-row', signedIn && 'is-ready')}>
              <SkinAvatar account={account} size={34} />
              <div className="skin-account-copy">
                <strong>{account?.name ?? 'No account connected'}</strong>
                <span>
                  {signedIn
                    ? 'Microsoft account · changes your in-game skin'
                    : account
                      ? 'Offline profile · preview only'
                      : 'Sign in to apply a skin in game'}
                </span>
              </div>
              {signedIn ? (
                <ShieldCheck size={16} className="skin-account-ready-icon" />
              ) : (
                <button type="button" className="skin-signin-link" onClick={() => openAccount(true)}>
                  Sign in
                </button>
              )}
            </div>

            {selectedApplied ? (
              <div className="skin-applied-note" role="status">
                <CheckCircle2 size={17} />
                <div>
                  <strong>Applied to {selectedApplied.name}</strong>
                  <span>Join a world or restart Minecraft to see it in game.</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-block skin-apply-button"
                disabled={busy || !selected.dataUrl}
                onClick={() => void applySkin()}
              >
                {busy ? (
                  <Spinner size={15} />
                ) : signedIn ? (
                  <ShieldCheck size={15} />
                ) : (
                  <UserRound size={15} />
                )}
                {busy
                  ? 'Applying to Minecraft…'
                  : signedIn
                    ? `Apply to ${account.name}`
                    : 'Sign in to apply'}
              </button>
            )}

            {applyError && (
              <div className="skin-apply-error" role="alert">
                <AlertTriangle size={14} /> {applyError}
              </div>
            )}

            <p className="skin-stage-note">
              Applying changes the skin on your Microsoft Minecraft profile. It is visible to other
              players, not just this launcher.
            </p>
            <Glass className="skin-stage-tip" flat>
              <Sparkles size={14} />
              <span>
                Want something original? Open Skin Studio to paint a texture, then upload it here.
              </span>
            </Glass>
          </div>
        </aside>
      </div>
    </div>
  )
}
