import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Compass,
  Download,
  Gauge,
  Home,
  Library,
  Play,
  Plus,
  Search,
  Settings,
  Shirt,
  UserRound
} from 'lucide-react'
import type { Route } from '../store'
import { useApp } from '../store'
import { cn } from '../lib/format'
import { playInstance } from '../lib/launch'

interface Action {
  id: string
  label: string
  group: string
  hint?: string
  icon: ReactNode
  run: () => void
}

export function CommandPalette() {
  const open = useApp((state) => state.paletteOpen)
  const setOpen = useApp((state) => state.setPaletteOpen)
  const navigate = useApp((state) => state.navigate)
  const setBrowse = useApp((state) => state.setBrowse)
  const openInstance = useApp((state) => state.openInstance)
  const instances = useApp((state) => state.instances)
  const setNewInstanceOpen = useApp((state) => state.setNewInstanceOpen)
  const setAccountOpen = useApp((state) => state.setAccountOpen)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [open])

  const actions = useMemo<Action[]>(() => {
    const pages: { id: Route; label: string; icon: ReactNode }[] = [
      { id: 'home', label: 'Go to Home', icon: <Home size={15} /> },
      { id: 'browse', label: 'Browse mods', icon: <Compass size={15} /> },
      { id: 'performance', label: 'Open Performance', icon: <Gauge size={15} /> },
      { id: 'library', label: 'Open Library', icon: <Library size={15} /> },
      { id: 'downloads', label: 'View Downloads', icon: <Download size={15} /> },
      { id: 'skins', label: 'Open Skin Changer', icon: <Shirt size={15} /> },
      { id: 'settings', label: 'Open Settings', icon: <Settings size={15} /> }
    ]
    const list: Action[] = pages.map((page) => ({
      id: `nav-${page.id}`,
      label: page.label,
      group: 'Navigate',
      icon: page.icon,
      run: () => {
        if (page.id === 'browse') setBrowse({ projectType: 'mod', category: '' })
        navigate(page.id)
      }
    }))
    list.push(
      {
        id: 'new-instance',
        label: 'Create a new instance',
        group: 'Actions',
        icon: <Plus size={15} />,
        run: () => setNewInstanceOpen(true)
      },
      {
        id: 'account',
        label: 'Manage account',
        group: 'Actions',
        icon: <UserRound size={15} />,
        run: () => setAccountOpen(true)
      }
    )
    for (const instance of instances) {
      list.push({
        id: `open-${instance.id}`,
        label: instance.name,
        group: 'Instances',
        hint: `${instance.mcVersion} · open details`,
        icon: instance.icon.startsWith('http') ? (
          <img src={instance.icon} alt="" className="palette-icon-img" />
        ) : (
          <span className="palette-emoji">{instance.icon}</span>
        ),
        run: () => openInstance(instance.id)
      })
      list.push({
        id: `play-${instance.id}`,
        label: `Play ${instance.name}`,
        group: 'Instances',
        hint: instance.mcVersion,
        icon: <Play size={15} />,
        run: () => playInstance(instance.id)
      })
    }
    return list
  }, [instances, navigate, setBrowse, openInstance, setAccountOpen, setNewInstanceOpen])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter((action) =>
      `${action.label} ${action.group} ${action.hint ?? ''}`.toLowerCase().includes(q)
    )
  }, [actions, query])

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setIndex((value) => Math.min(value + 1, Math.max(filtered.length - 1, 0)))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setIndex((value) => Math.max(value - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        filtered[index]?.run()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, index, setOpen])

  if (!open) return null

  let lastGroup = ''

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <div className="palette glass glass--strong" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search or run a command…"
            spellCheck={false}
          />
          <span className="kbd">ESC</span>
        </div>
        <div className="palette-list">
          {filtered.length === 0 && <div className="palette-empty">Nothing matches “{query}”.</div>}
          {filtered.map((action, actionIndex) => {
            const showGroup = action.group !== lastGroup
            lastGroup = action.group
            return (
              <div key={action.id}>
                {showGroup && <div className="palette-group">{action.group}</div>}
                <button
                  type="button"
                  className={cn('palette-item', actionIndex === index && 'active')}
                  onMouseEnter={() => setIndex(actionIndex)}
                  onClick={() => {
                    action.run()
                    setOpen(false)
                  }}
                >
                  <span className="palette-item-icon">{action.icon}</span>
                  <span className="palette-item-label">{action.label}</span>
                  {action.hint && <span className="palette-item-hint">{action.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="palette-foot">
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> navigate
          </span>
          <span>
            <span className="kbd">↵</span> select
          </span>
          <span className="palette-brand">Triad command bar</span>
        </div>
      </div>
    </div>
  )
}
