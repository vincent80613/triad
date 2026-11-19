import { useMemo, useState, type CSSProperties } from 'react'
import { Boxes, FolderTree, Heart, Import, Plus, Search, SlidersHorizontal, Star } from 'lucide-react'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { useT } from '../i18n'
import { cn, tagColor } from '../lib/format'
import { Glass } from '../components/Glass'
import { EmptyState, Segmented } from '../components/Controls'
import { InstanceTile } from '../components/InstanceCard'

type Sort = 'recent' | 'name' | 'created' | 'custom'
type Grouping = 'none' | 'folder'

export function Library() {
  const t = useT()
  const instances = useApp((state) => state.instances)
  const setNewInstanceOpen = useApp((state) => state.setNewInstanceOpen)
  const navigate = useApp((state) => state.navigate)
  const refreshInstances = useApp((state) => state.refreshInstances)
  const openInstance = useApp((state) => state.openInstance)
  const pushToast = useApp((state) => state.pushToast)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const [grouping, setGrouping] = useState<Grouping>('none')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [groupFilter, setGroupFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const groups = useMemo(
    () => [...new Set(instances.map((instance) => instance.group?.trim()).filter(Boolean))] as string[],
    [instances]
  )
  const tags = useMemo(
    () => [...new Set(instances.flatMap((instance) => instance.tags ?? []))].sort(),
    [instances]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = instances.filter(
      (instance) =>
        (!q ||
          instance.name.toLowerCase().includes(q) ||
          instance.mcVersion.toLowerCase().includes(q) ||
          instance.loader.includes(q) ||
          instance.tags?.some((tag) => tag.toLowerCase().includes(q)) ||
          instance.group?.toLowerCase().includes(q)) &&
        (!favoritesOnly || instance.favorite) &&
        (groupFilter === 'all' || (instance.group ?? '') === groupFilter) &&
        (!tagFilter || instance.tags?.includes(tagFilter))
    )
    list = [...list]
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'created') list.sort((a, b) => b.created - a.created)
    else if (sort === 'recent') {
      list.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    }
    // Custom keeps the exact saved order so drag-to-reorder is predictable.
    return list
  }, [instances, query, sort, favoritesOnly, groupFilter, tagFilter])

  const grouped = useMemo(() => {
    if (grouping !== 'folder') return null
    const map = new Map<string, typeof filtered>()
    for (const instance of filtered) {
      const key = instance.group?.trim() || 'Unfiled'
      const current = map.get(key) ?? []
      current.push(instance)
      map.set(key, current)
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === 'Unfiled') return 1
      if (b === 'Unfiled') return -1
      return a.localeCompare(b)
    })
  }, [filtered, grouping])

  async function importPack(): Promise<void> {
    setImporting(true)
    try {
      const instance = await api.instances.import()
      if (!instance) return
      await refreshInstances()
      openInstance(instance.id)
      pushToast({
        title: 'Instance imported',
        description: `${instance.name} is ready with its mods, configs and worlds.`,
        variant: 'success'
      })
    } catch (error) {
      pushToast({ title: 'Import failed', description: errorMessage(error), variant: 'error' })
    } finally {
      setImporting(false)
    }
  }

  function dropOn(targetId: string): void {
    if (!dragging || dragging === targetId) {
      setDragging(null)
      return
    }
    const ids = instances.map((instance) => instance.id)
    const from = ids.indexOf(dragging)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, dragging)
    setDragging(null)
    void api.instances
      .reorder(ids)
      .then(refreshInstances)
      .catch((error) =>
        pushToast({ title: 'Could not reorder instances', description: errorMessage(error), variant: 'error' })
      )
  }

  function renderGrid(list: typeof filtered) {
    return (
      <div className="instance-grid">
        {list.map((instance) => (
          <div
            key={instance.id}
            className={cn(
              'instance-slot',
              sort === 'custom' && 'is-draggable',
              dragging === instance.id && 'is-dragging'
            )}
            draggable={sort === 'custom'}
            onDragStart={() => setDragging(instance.id)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dropOn(instance.id)}
          >
            <InstanceTile instance={instance} />
          </div>
        ))}
        <button type="button" className="instance-new" onClick={() => setNewInstanceOpen(true)}>
          <div className="instance-new-mark">
            <Plus size={20} />
          </div>
          <span>{t('library.new')}</span>
          <small>Vanilla, Fabric, Forge or a template</small>
        </button>
      </div>
    )
  }

  const activeFilters = favoritesOnly || groupFilter !== 'all' || !!tagFilter

  return (
    <div className="page library-page">
      <div className="page-header library-head">
        <div className="page-heading">
          <div className="eyebrow">
            <Boxes size={11} /> {t('nav.library')}
          </div>
          <h1 className="page-title">{t('library.title')}</h1>
          <p className="page-sub">{t('library.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" disabled={importing} onClick={() => void importPack()}>
            <Import size={15} /> {importing ? 'Importing…' : t('library.import')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setNewInstanceOpen(true)}>
            <Plus size={15} /> {t('library.new')}
          </button>
        </div>
      </div>

      <div className="library-summary">
        <span className="library-summary-item">
          <strong>{instances.length}</strong> instances
        </span>
        <span className="library-summary-item">
          <Star size={12} fill="currentColor" /> <strong>{instances.filter((instance) => instance.favorite).length}</strong> pinned
        </span>
        <span className="library-summary-item">
          <FolderTree size={12} /> <strong>{groups.length}</strong> groups
        </span>
        {tagFilter && (
          <button type="button" className="library-filter-pill active" onClick={() => setTagFilter('')}>
            #{tagFilter} ×
          </button>
        )}
      </div>

      <Glass className="library-toolbar-panel" matte>
        <div className="library-toolbar-row">
          <div className="search-box library-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search names, versions, tags…"
            />
          </div>
          <button
            type="button"
            className={cn('filter-chip', favoritesOnly && 'active')}
            onClick={() => setFavoritesOnly((value) => !value)}
          >
            <Heart size={13} fill={favoritesOnly ? 'currentColor' : 'none'} /> {t('library.favoritesOnly')}
          </button>
          {groups.length > 0 && (
            <label className="inline-select">
              <span className="muted small">Group</span>
              <select
                className="input select"
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
              >
                <option value="all">All groups</option>
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>
          )}
          {activeFilters && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setFavoritesOnly(false)
                setGroupFilter('all')
                setTagFilter('')
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {tags.length > 0 && (
          <div className="library-tag-row">
            <span className="muted small">Tags</span>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={cn('library-tag-filter', tagFilter === tag && 'active')}
                style={{ '--tag-color': tagColor(tag) } as CSSProperties}
                onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <div className="library-toolbar-row library-toolbar-row--bottom">
          <span className="muted small">
            <SlidersHorizontal size={12} /> Sort
          </span>
          <Segmented<Sort>
            value={sort}
            onChange={setSort}
            options={[
              { value: 'recent', label: t('library.sortRecent') },
              { value: 'custom', label: t('library.sortCustom') },
              { value: 'name', label: t('library.sortName') },
              { value: 'created', label: t('library.sortNewest') }
            ]}
          />
          <Segmented<Grouping>
            value={grouping}
            onChange={setGrouping}
            options={[
              { value: 'none', label: t('library.groupNone') },
              { value: 'folder', label: t('library.groupFolder') }
            ]}
          />
          {sort === 'custom' && <span className="muted small">Drag cards to reorder</span>}
          {query && (
            <span className="muted small">
              {filtered.length} matching {filtered.length === 1 ? 'instance' : 'instances'}
            </span>
          )}
        </div>
      </Glass>

      {instances.length === 0 ? (
        <Glass className="empty-wrap">
          <EmptyState
            icon={<Boxes size={24} />}
            title={t('library.empty')}
            description="Start from a template or create a custom instance for any Minecraft version and loader."
            action={
              <div className="empty-actions">
                <button type="button" className="btn btn-primary" onClick={() => setNewInstanceOpen(true)}>
                  <Plus size={15} /> {t('library.new')}
                </button>
                <button type="button" className="btn" onClick={() => navigate('browse')}>
                  Browse modpacks
                </button>
              </div>
            }
          />
        </Glass>
      ) : filtered.length === 0 ? (
        <Glass className="empty-wrap">
          <EmptyState
            icon={<Search size={22} />}
            title="Nothing matches those filters"
            description="Try a different search, tag, group or sort."
            action={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setQuery('')
                  setFavoritesOnly(false)
                  setGroupFilter('all')
                  setTagFilter('')
                }}
              >
                Clear filters
              </button>
            }
          />
        </Glass>
      ) : grouped ? (
        <div className="library-groups">
          {grouped.map(([group, list]) => (
            <section key={group} className="library-group">
              <header className="library-group-head">
                <div>
                  <FolderTree size={14} />
                  <h2>{group}</h2>
                  <span>{list.length}</span>
                </div>
              </header>
              {renderGrid(list)}
            </section>
          ))}
        </div>
      ) : (
        renderGrid(filtered)
      )}
    </div>
  )
}
