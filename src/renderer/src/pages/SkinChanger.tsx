import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Heart,
  ImagePlus,
  Palette,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound
} from 'lucide-react'
import type {
  SkinCatalogEntry,
  SkinCatalogSort,
  SkinCatalogTexture,
  SkinSelection,
  SkinSelectionMeta,
  SkinVariant
} from '@shared/types'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { cn } from '../lib/format'
import { Glass } from '../components/Glass'
import { Chip, Spinner } from '../components/Controls'
import { SkinAvatar } from '../components/SkinAvatar'
import { SkinPreview } from '../components/SkinPreview'

const SORTS: { value: SkinCatalogSort; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'latest', label: 'Latest' },
  { value: 'recently-commented', label: 'Recently commented' }
]

const SEARCH_DELAY = 420
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

interface CustomSkin {
  name: string
  dataUrl: string
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

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}

export function SkinChanger() {
  const account = useApp((state) => state.account)
  const openAccount = useApp((state) => state.setAccountOpen)
  const openSkinStudio = useApp((state) => state.setSkinStudioOpen)
  const pushToast = useApp((state) => state.pushToast)
  const fileRef = useRef<HTMLInputElement>(null)

  const [sort, setSort] = useState<SkinCatalogSort>('top')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [reload, setReload] = useState(0)
  const [entries, setEntries] = useState<SkinCatalogEntry[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [catalogueError, setCatalogueError] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const [texture, setTexture] = useState<SkinCatalogTexture | null>(null)
  const [textureLoading, setTextureLoading] = useState(false)
  const [textureError, setTextureError] = useState('')

  const [custom, setCustom] = useState<CustomSkin | null>(null)
  const [customActive, setCustomActive] = useState(false)
  const [customVariant, setCustomVariant] = useState<SkinVariant>('classic')
  const [uploadError, setUploadError] = useState('')

  const [busy, setBusy] = useState(false)
  const [applyError, setApplyError] = useState('')

  const [selection, setSelection] = useState<SkinSelection | null>(null)
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [favorites, setFavorites] = useState<SkinCatalogEntry[]>([])
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteBusy, setFavoriteBusy] = useState('')

  const signedIn = account?.type === 'microsoft'
  const selectedEntry = useMemo(
    () =>
      entries.find((entry) => entry.id === selectedId) ??
      favorites.find((entry) => entry.id === selectedId) ??
      null,
    [entries, favorites, selectedId]
  )
  const textureKey = selectedEntry?.id ?? ''
  const stageTexture = customActive
    ? (custom?.dataUrl ?? '')
    : selectedEntry
      ? (texture?.dataUrl ??
        (selection?.id === selectedEntry.id ? selection.dataUrl : ''))
      : (selection?.dataUrl ?? '')
  const stageVariant: SkinVariant = customActive
    ? customVariant
    : selectedEntry
      ? (texture?.variant ??
        (selection?.id === selectedEntry.id ? selection.variant : 'classic'))
      : (selection?.variant ?? 'classic')
  const stageName = customActive
    ? (custom?.name ?? 'Custom skin')
    : (selectedEntry?.name ?? selection?.name ?? '')
  const stageIsWorn =
    !!selection &&
    (customActive
      ? selection.id === 'custom-upload' && selection.dataUrl === (custom?.dataUrl ?? '')
      : selectedEntry
        ? selection.id === selectedEntry.id
        : true)
  const stageMeta: SkinSelectionMeta | null = customActive
    ? custom
      ? { id: 'custom-upload', name: custom.name }
      : null
    : selectedEntry
      ? {
          id: selectedEntry.id,
          name: selectedEntry.name,
          author: selectedEntry.author,
          pageUrl: selectedEntry.pageUrl
        }
      : selection
        ? {
            id: selection.id,
            name: selection.name,
            author: selection.author,
            pageUrl: selection.pageUrl
          }
        : null
  const activeSort = SORTS.find((item) => item.value === sort)?.label ?? 'Top'

  const favoriteMatches = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return favorites
    return favorites.filter(
      (entry) =>
        entry.name.toLowerCase().includes(term) || entry.author.toLowerCase().includes(term)
    )
  }, [favorites, search])
  const visibleEntries = favoritesOnly ? favoriteMatches : entries
  const isFavorite = (id: string): boolean => favorites.some((entry) => entry.id === id)

  useEffect(() => {
    let cancelled = false
    void Promise.all([api.skins.selection(), api.skins.favorites()])
      .then(([storedSelection, storedFavorites]) => {
        if (cancelled) return
        setSelection(storedSelection)
        setFavorites(storedFavorites)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLibraryLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = search.trim()
      setQuery(next.length >= 3 ? next : '')
    }, SEARCH_DELAY)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setCatalogueError('')
    setEntries([])
    setPage(1)
    setHasMore(false)
    setSelectedId('')
    setCustomActive(false)
    void api.skins
      .catalog({ sort, page: 1, query })
      .then((result) => {
        if (cancelled) return
        setEntries(result.entries)
        setHasMore(result.hasMore)
      })
      .catch((error) => {
        if (!cancelled) setCatalogueError(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sort, query, reload])

  // Only auto-preview the first catalogue skin when nothing is worn yet. A
  // stored selection always wins, so leaving the page never changes the skin.
  useEffect(() => {
    if (!libraryLoaded || loading || selection || customActive || selectedId) return
    const first = entries[0]
    if (first) setSelectedId(first.id)
  }, [libraryLoaded, loading, selection, customActive, selectedId, entries])

  useEffect(() => {
    if (!selectedEntry || customActive) {
      setTexture(null)
      setTextureLoading(false)
      setTextureError('')
      return
    }
    let cancelled = false
    setTexture(null)
    setTextureLoading(true)
    setTextureError('')
    void api.skins
      .texture({ id: selectedEntry.id, pageUrl: selectedEntry.pageUrl })
      .then((result) => {
        if (!cancelled) setTexture(result)
      })
      .catch((error) => {
        if (!cancelled) setTextureError(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setTextureLoading(false)
      })
    return () => {
      cancelled = true
    }
    // The texture only needs reloading when a different skin is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textureKey, customActive])

  async function loadMore(): Promise<void> {
    if (loadingMore || !hasMore) return
    const nextPage = page + 1
    setLoadingMore(true)
    try {
      const result = await api.skins.catalog({ sort, page: nextPage, query })
      setEntries((current) => {
        const seen = new Set(current.map((entry) => entry.id))
        return [...current, ...result.entries.filter((entry) => !seen.has(entry.id))]
      })
      setHasMore(result.hasMore)
      setPage(nextPage)
    } catch (error) {
      pushToast({
        title: 'Could not load more skins',
        description: errorMessage(error),
        variant: 'error'
      })
    } finally {
      setLoadingMore(false)
    }
  }

  async function onFile(file: File | undefined): Promise<void> {
    if (!file) return
    setUploadError('')
    try {
      if (!/\.png$/i.test(file.name) && file.type !== 'image/png') {
        throw new Error('Choose a PNG skin texture.')
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error('That skin is too large (maximum 2 MB).')
      }
      const dataUrl = await readFile(file)
      const image = await loadImage(dataUrl)
      if (image.naturalWidth !== 64 || (image.naturalHeight !== 64 && image.naturalHeight !== 32)) {
        throw new Error('Use a 64×64 or legacy 64×32 Minecraft skin PNG.')
      }
      const next: CustomSkin = {
        name: file.name.replace(/\.png$/i, '') || 'Custom skin',
        dataUrl
      }
      setCustom(next)
      setCustomActive(true)
      setApplyError('')
      pushToast({
        title: 'Skin loaded',
        description: 'Choose the arm model, then apply it.',
        variant: 'success'
      })
    } catch (error) {
      setUploadError(errorMessage(error))
    }
  }

  async function applySkin(): Promise<void> {
    if (!signedIn) {
      openAccount(true)
      return
    }
    if (!stageTexture || !stageMeta) return
    setBusy(true)
    setApplyError('')
    try {
      const result = await api.skins.apply(stageTexture, stageVariant, stageMeta)
      setSelection({
        ...stageMeta,
        variant: stageVariant,
        dataUrl: stageTexture,
        appliedAt: result.appliedAt
      })
    } catch (error) {
      setApplyError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function toggleFavorite(entry: SkinCatalogEntry): Promise<void> {
    if (favoriteBusy) return
    const favorite = !isFavorite(entry.id)
    setFavoriteBusy(entry.id)
    try {
      setFavorites(await api.skins.setFavorite(entry, favorite))
    } catch (error) {
      pushToast({
        title: favorite ? 'Could not save favorite' : 'Could not remove favorite',
        description: errorMessage(error),
        variant: 'error'
      })
    } finally {
      setFavoriteBusy('')
    }
  }

  function chooseEntry(entry: SkinCatalogEntry): void {
    setSelectedId(entry.id)
    setCustomActive(false)
    setApplyError('')
    setTextureError('')
  }

  function chooseSort(next: SkinCatalogSort): void {
    setFavoritesOnly(false)
    setSort(next)
    if (search.trim()) {
      setSearch('')
      setQuery('')
    }
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
            Every skin is streamed live from minecraftskins.com — preview it, then wear it in game.
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
                placeholder="Search minecraftskins.com…"
                aria-label="Search skins on minecraftskins.com"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <span className="skin-result-count">
              {favoritesOnly
                ? `${favoriteMatches.length} saved`
                : loading
                  ? 'Loading…'
                  : `${entries.length}${hasMore ? '+' : ''} loaded`}
            </span>
          </div>

          <div className="skin-source-bar">
            <span className="skin-source-pill">
              {favoritesOnly ? 'Favorites' : 'minecraftskins.com'}
            </span>
            <span className="skin-source-meta">
              {favoritesOnly
                ? 'Saved in Triad'
                : query
                  ? `Search “${query}”`
                  : `${activeSort} skins`}{' '}
              {!favoritesOnly && <>· page {page}</>}
            </span>
            <button
              type="button"
              className="skin-source-link"
              onClick={() => void api.app.openExternal('https://www.minecraftskins.com/')}
            >
              Browse the full site <ExternalLink size={10} />
            </button>
          </div>

          <div className="skin-filter-row">
            {SORTS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn('skin-filter', !favoritesOnly && sort === option.value && 'active')}
                onClick={() => chooseSort(option.value)}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              className={cn('skin-filter skin-filter-favorites', favoritesOnly && 'active')}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((value) => !value)}
            >
              <Heart size={10} fill={favoritesOnly ? 'currentColor' : 'none'} />
              Favorites
              {favorites.length > 0 && <span className="skin-filter-count">{favorites.length}</span>}
            </button>
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

          {catalogueError && (
            <div className="skin-catalog-error" role="alert">
              <AlertTriangle size={15} />
              <div>
                <strong>Could not load skins</strong>
                <span>{catalogueError}</span>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setReload((value) => value + 1)}
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {loading && !favoritesOnly ? (
            <div className="skin-catalog-status">
              <Spinner size={15} /> Loading skins from minecraftskins.com…
            </div>
          ) : (
            <div className="skin-grid">
              {!favoritesOnly && (
                <button
                  type="button"
                  className={cn('skin-upload-card', customActive && 'active')}
                  onClick={() => fileRef.current?.click()}
                >
                  <span className="skin-upload-mark">
                    <ImagePlus size={22} />
                  </span>
                  <strong>{custom ? 'Replace upload' : 'Use your own'}</strong>
                  <small>64×64 or 64×32 PNG</small>
                </button>
              )}

              {visibleEntries.map((entry) => {
                const active = !customActive && selectedEntry?.id === entry.id
                const favorite = isFavorite(entry.id)
                return (
                  <div className="skin-card-wrap" key={entry.id}>
                    <button
                      type="button"
                      className={cn('skin-card', active && 'active')}
                      aria-pressed={active}
                      onClick={() => chooseEntry(entry)}
                    >
                      <span className="skin-card-visual">
                        <img
                          className="skin-card-photo"
                          src={entry.previewUrl}
                          alt={`${entry.name} preview`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        {active && (
                          <span className="skin-card-check">
                            <Check size={12} />
                          </span>
                        )}
                        {entry.likes > 0 && (
                          <span className="skin-card-likes">
                            <Heart size={8} /> {formatCount(entry.likes)}
                          </span>
                        )}
                      </span>
                      <span className="skin-card-copy">
                        <strong>{entry.name}</strong>
                        <span>{entry.author || 'Unknown creator'}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={cn('skin-fav', favorite && 'active')}
                      aria-label={
                        favorite
                          ? `Remove ${entry.name} from favorites`
                          : `Save ${entry.name} to favorites`
                      }
                      aria-pressed={favorite}
                      title={favorite ? 'Remove from favorites' : 'Save to favorites'}
                      disabled={favoriteBusy === entry.id}
                      onClick={() => void toggleFavorite(entry)}
                    >
                      <Heart size={12} fill={favorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {!favoritesOnly && !loading && !catalogueError && entries.length === 0 && (
            <div className="skin-no-results">
              <Search size={20} />
              <strong>{query ? `No skins match “${query}”` : 'No skins on this page'}</strong>
              <span>{query ? 'Try another search.' : 'Retry or open minecraftskins.com.'}</span>
            </div>
          )}

          {favoritesOnly && favoriteMatches.length === 0 && (
            <div className="skin-no-results">
              <Heart size={20} />
              <strong>
                {favorites.length
                  ? `No favorites match “${search.trim()}”`
                  : 'No favorite skins yet'}
              </strong>
              <span>
                {favorites.length
                  ? 'Try another search.'
                  : 'Tap the heart on any skin to save it here.'}
              </span>
            </div>
          )}

          {!favoritesOnly && !loading && entries.length > 0 && hasMore && (
            <div className="skin-load-more-row">
              <button
                type="button"
                className="btn skin-load-more"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? <Spinner size={13} /> : <Sparkles size={13} />}
                {loadingMore ? 'Loading more…' : 'Load more skins'}
                <span>page {page + 1} of the Skindex</span>
              </button>
            </div>
          )}
        </section>

        <aside className="skin-stage-card glass glass--strong" aria-label="Selected skin">
          <div className="skin-stage-top">
            <span className="skin-stage-kicker">
              <span className="live-dot" /> {stageIsWorn ? 'Currently wearing' : 'Live preview'}
            </span>
            <span className="skin-stage-number">
              {loading && !favoritesOnly
                ? 'Connecting…'
                : favoritesOnly
                  ? `${favorites.length} favorites`
                  : `${entries.length} from the Skindex`}
            </span>
          </div>

          <div className="skin-stage-visual">
            <span className="skin-stage-halo" />
            <span className="skin-stage-orbit skin-stage-orbit--one" />
            <span className="skin-stage-orbit skin-stage-orbit--two" />
            {stageTexture ? (
              <SkinPreview
                src={stageTexture}
                variant={stageVariant}
                className="skin-stage-canvas"
                label={`Selected skin: ${stageName || 'custom skin'}`}
              />
            ) : selectedEntry && !customActive ? (
              <img
                className="skin-stage-photo"
                src={selectedEntry.previewUrl}
                alt={`${selectedEntry.name} preview`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="skin-stage-empty">
                <Sparkles size={20} />
                <span>Pick a skin to preview</span>
              </div>
            )}
            {textureLoading && (
              <span className="skin-stage-loading">
                <Spinner size={11} /> Fetching texture
              </span>
            )}
            <span className="skin-stage-floor" />
          </div>

          <div className="skin-stage-copy">
            <div className="skin-stage-title-row">
              <div>
                <span className="skin-stage-overline">
                  {stageIsWorn
                    ? 'Currently wearing'
                    : customActive
                      ? 'Your upload'
                      : selectedEntry
                        ? 'minecraftskins.com'
                        : 'Skin library'}
                </span>
                <h2>{stageName || 'No skin selected'}</h2>
              </div>
              <div className="skin-stage-title-actions">
                <Chip tone="muted">{stageVariant === 'slim' ? 'Slim' : 'Classic'}</Chip>
                {selectedEntry && (
                  <button
                    type="button"
                    className={cn('skin-stage-fav', isFavorite(selectedEntry.id) && 'active')}
                    aria-label={
                      isFavorite(selectedEntry.id)
                        ? `Remove ${selectedEntry.name} from favorites`
                        : `Save ${selectedEntry.name} to favorites`
                    }
                    aria-pressed={isFavorite(selectedEntry.id)}
                    title={isFavorite(selectedEntry.id) ? 'Remove from favorites' : 'Save to favorites'}
                    disabled={favoriteBusy === selectedEntry.id}
                    onClick={() => void toggleFavorite(selectedEntry)}
                  >
                    <Heart
                      size={13}
                      fill={isFavorite(selectedEntry.id) ? 'currentColor' : 'none'}
                    />
                  </button>
                )}
              </div>
            </div>

            {customActive ? (
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
            ) : selectedEntry ? (
              <button
                type="button"
                className="skin-stage-credit"
                onClick={() => void api.app.openExternal(selectedEntry.pageUrl)}
              >
                {selectedEntry.author ? `By ${selectedEntry.author}` : 'Open skin page'}
                <ExternalLink size={10} />
              </button>
            ) : selection?.pageUrl ? (
              <button
                type="button"
                className="skin-stage-credit"
                onClick={() => void api.app.openExternal(selection.pageUrl as string)}
              >
                {selection.author ? `By ${selection.author}` : 'Open skin page'}
                <ExternalLink size={10} />
              </button>
            ) : null}

            {textureError && !customActive && (
              <div className="skin-apply-error" role="alert">
                <AlertTriangle size={14} /> {textureError}
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

            {stageIsWorn ? (
              <div className="skin-applied-note" role="status">
                <CheckCircle2 size={17} />
                <div>
                  <strong>{stageName || 'Your skin'} is on your Minecraft profile</strong>
                  <span>
                    It stays until you apply another skin. Join a world or restart Minecraft to see
                    a change.
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-block skin-apply-button"
                disabled={busy || !stageTexture || !stageMeta}
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
                  : !stageTexture
                    ? textureLoading
                      ? 'Loading skin…'
                      : 'Choose a skin'
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
                {customActive
                  ? 'Want something original? Paint it in Skin Studio, then upload it here.'
                  : 'This library is the Skindex catalogue. Pick any of its skins and Triad fetches the exact texture for you.'}
              </span>
            </Glass>
          </div>
        </aside>
      </div>
    </div>
  )
}
