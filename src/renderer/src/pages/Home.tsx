import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Boxes,
  Clock,
  Compass,
  DownloadCloud,
  Package,
  Play,
  Plus,
  RefreshCw,
  Server,
  Sparkles,
  Square
} from 'lucide-react'
import type { ModrinthSearchHit, World } from '@shared/types'
import { api } from '../api'
import { useApp } from '../store'
import { useT } from '../i18n'
import { compact, loaderLabel, playtime } from '../lib/format'
import { playInstance, stopGame } from '../lib/launch'
import { Glass } from '../components/Glass'
import { Chip, Spinner } from '../components/Controls'
import { InstanceTile } from '../components/InstanceCard'
import { ProjectCard } from '../components/ProjectCard'
import { SkinAvatar } from '../components/SkinAvatar'
import logo from '../assets/logo.svg'

function useCountUp(value: number): number {
  const motion = useApp((state) => state.settings.motion)
  const [display, setDisplay] = useState(0)
  const displayed = useRef(0)

  useEffect(() => {
    if (!motion) {
      displayed.current = value
      setDisplay(value)
      return
    }
    const from = displayed.current
    const started = performance.now()
    const duration = 720
    let frame = 0
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - started) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = from + (value - from) * eased
      displayed.current = next
      setDisplay(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, motion])

  return Math.max(0, Math.round(display))
}

export function Home() {
  const t = useT()
  const instances = useApp((state) => state.instances)
  const activeInstanceId = useApp((state) => state.activeInstanceId)
  const account = useApp((state) => state.account)
  const stats = useApp((state) => state.stats)
  const launch = useApp((state) => state.launch)
  const navigate = useApp((state) => state.navigate)
  const openInstance = useApp((state) => state.openInstance)
  const setNewInstanceOpen = useApp((state) => state.setNewInstanceOpen)
  const setBrowse = useApp((state) => state.setBrowse)
  const setActiveInstance = useApp((state) => state.setActiveInstance)
  const autoStatus = useApp((state) => state.autoStatus)
  const refreshAutoStatus = useApp((state) => state.refreshAutoStatus)
  const pushToast = useApp((state) => state.pushToast)
  const [trending, setTrending] = useState<ModrinthSearchHit[]>([])
  const [trendingLoading, setTrendingLoading] = useState(true)
  const [modCount, setModCount] = useState(0)
  const [worlds, setWorlds] = useState<World[]>([])

  const active = instances.find((instance) => instance.id === activeInstanceId) ?? instances[0]
  const favorites = instances.filter((instance) => instance.favorite)

  useEffect(() => {
    if (!active) {
      setWorlds([])
      return
    }
    let cancelled = false
    void api.instances
      .worlds(active.id)
      .then((next) => {
        if (!cancelled) setWorlds(next.slice(0, 4))
      })
      .catch(() => undefined)
    void refreshAutoStatus().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [active?.id])

  useEffect(() => {
    let cancelled = false
    setTrendingLoading(true)
    void api.modrinth
      .search({ query: '', projectType: 'mod', sort: 'downloads', limit: 8 })
      .then((result) => {
        if (!cancelled) setTrending(result.hits)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setTrendingLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.all(instances.map((instance) => api.mods.list(instance.id)))
      .then((lists) => {
        if (!cancelled) setModCount(lists.reduce((total, list) => total + list.length, 0))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [instances])

  const weekly = useMemo(() => {
    const days: { key: string; label: string; value: number }[] = []
    for (let index = 6; index >= 0; index--) {
      const date = new Date()
      date.setDate(date.getDate() - index)
      const key = date.toISOString().slice(0, 10)
      days.push({
        key,
        label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2),
        value: stats.days[key] ?? 0
      })
    }
    return days
  }, [stats])

  const weekTotal = weekly.reduce((total, day) => total + day.value, 0)
  const weekMax = Math.max(...weekly.map((day) => day.value), 1)
  const allTime = instances.reduce((total, instance) => total + instance.playtimeMs, 0)
  const animatedWeek = useCountUp(weekTotal)
  const animatedAllTime = useCountUp(allTime)
  const animatedInstances = useCountUp(instances.length)
  const animatedMods = useCountUp(modCount)
  const greeting =
    new Date().getHours() < 5
      ? 'Late night'
      : new Date().getHours() < 12
        ? 'Good morning'
        : new Date().getHours() < 18
          ? 'Good afternoon'
          : 'Good evening'

  const busy = launch.status === 'preparing' || launch.status === 'running'
  const recentWorld = worlds[0]
  const recentServer = active?.servers?.[0]

  function quickPlay(): void {
    if (!active) return
    playInstance(active.id, undefined, recentWorld?.folder)
  }

  async function runAutoCheck(): Promise<void> {
    try {
      const status = await api.auto.run()
      await refreshAutoStatus()
      pushToast({ title: 'Auto downloader', description: status.message, variant: 'success' })
    } catch {
      pushToast({ title: 'Auto downloader failed', variant: 'error' })
    }
  }
  const isThisRunning = launch.instanceId === active?.id && busy

  return (
    <div className="page home">
      <div className="home-head">
        <div className="home-greeting">
          <SkinAvatar account={account} size={38} />
          <div>
            <div className="eyebrow">
              <Sparkles size={11} /> Triad
            </div>
            <h1>
              {greeting}
              {account ? `, ${account.name}` : ''}
            </h1>
            <p>Pick up where you left off, or find something new to play.</p>
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setBrowse({ projectType: 'mod', category: '' })
              navigate('browse')
            }}
          >
            <Compass size={15} /> Browse mods
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setNewInstanceOpen(true)}>
            <Plus size={15} /> New instance
          </button>
        </div>
      </div>

      <div className="home-hero">
        <Glass className="hero-main">
          {active ? (
            <>
              {active.icon.startsWith('http') ? (
                <img className="hero-watermark" src={active.icon} alt="" />
              ) : (
                <span className="hero-watermark hero-emoji">{active.icon}</span>
              )}
              <div
                className="hero-glow"
                style={{ background: `radial-gradient(circle, ${active.tint}, transparent 68%)` }}
              />
              <div className="hero-eyebrow">
                <span className="live-dot subtle" /> Active instance
              </div>
              <div className="hero-heading">
                <div
                  className="hero-icon"
                  style={{
                    background: `linear-gradient(145deg, color-mix(in srgb, ${active.tint} 52%, transparent), rgb(255 255 255 / 0.05))`
                  }}
                >
                  {active.icon.startsWith('http') ? <img src={active.icon} alt="" /> : active.icon}
                </div>
                <div>
                  <h2>{active.name}</h2>
                  <div className="hero-chips">
                    <Chip tone="accent">Minecraft {active.mcVersion}</Chip>
                    <Chip>{loaderLabel(active.loader)}</Chip>
                    {active.loaderVersion && <Chip>{active.loaderVersion}</Chip>}
                  </div>
                </div>
              </div>
              <p className="hero-sub">
                {active.lastPlayed
                  ? `Last played ${new Date(active.lastPlayed).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} · ${playtime(active.playtimeMs)} played`
                  : 'A fresh instance, ready for its first launch.'}
              </p>
              {(recentWorld || recentServer) && !isThisRunning && (
                <div className="quick-play-row">
                  <span className="quick-play-label">
                    <Sparkles size={11} /> {t('home.quickPlay')}
                  </span>
                  {recentWorld && (
                    <button type="button" className="quick-play-chip" onClick={quickPlay}>
                      <span className="quick-play-emoji">🌍</span>
                      <span>
                        <strong>{recentWorld.name}</strong>
                        <small>Load world</small>
                      </span>
                      <Play size={12} fill="currentColor" />
                    </button>
                  )}
                  {recentServer && (
                    <button
                      type="button"
                      className="quick-play-chip"
                      onClick={() => playInstance(active.id, recentServer.address)}
                    >
                      <span className="quick-play-emoji">
                        <Server size={14} />
                      </span>
                      <span>
                        <strong>{recentServer.name}</strong>
                        <small>Join server</small>
                      </span>
                      <Play size={12} fill="currentColor" />
                    </button>
                  )}
                </div>
              )}
              <div className="hero-actions">
                {isThisRunning ? (
                  <button type="button" className="play-btn play-btn--stop" onClick={stopGame}>
                    <Square size={15} fill="currentColor" /> Stop game
                  </button>
                ) : (
                  <button
                    type="button"
                    className="play-btn"
                    disabled={busy && launch.instanceId !== active.id}
                    onClick={() => playInstance(active.id)}
                  >
                    {launch.status === 'preparing' && launch.instanceId === active.id ? (
                      <Spinner size={17} />
                    ) : (
                      <Play size={17} fill="currentColor" />
                    )}
                    {launch.status === 'preparing' && launch.instanceId === active.id
                      ? 'Launching…'
                      : 'Play'}
                  </button>
                )}
                <button type="button" className="btn" onClick={() => openInstance(active.id)}>
                  Manage instance
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setActiveInstance(active.id)
                    setBrowse({
                      projectType: 'mod',
                      gameVersion: active.mcVersion,
                      loader: active.loader === 'vanilla' ? '' : active.loader,
                      category: ''
                    })
                    navigate('browse')
                  }}
                >
                  <Package size={14} /> Add mods
                </button>
              </div>
            </>
          ) : (
            <div className="hero-empty">
              <img className="hero-logo" src={logo} alt="Triad" />
              <div className="hero-eyebrow">
                <Sparkles size={12} /> Your first launch
              </div>
              <h2>One launcher. Every world.</h2>
              <p>
                Sign in with Microsoft, install any Minecraft version, add mods, and join your
                friends&apos; servers — all in one place.
              </p>
              <div className="hero-actions">
                <button type="button" className="play-btn" onClick={() => setNewInstanceOpen(true)}>
                  <Plus size={17} /> Create instance
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setBrowse({ projectType: 'mod', category: '' })
                    navigate('browse')
                  }}
                >
                  <Compass size={15} /> Browse mods
                </button>
              </div>
            </div>
          )}
        </Glass>

        <div className="hero-side">
          <Glass className="week-card">
            <div className="week-head">
              <div>
                <span className="card-label">This week</span>
                <strong>{playtime(animatedWeek)}</strong>
              </div>
              <span className="week-badge">
                <Clock size={12} /> {stats.sessions.length} sessions
              </span>
            </div>
            <div className="bars">
              {weekly.map((day) => (
                <div key={day.key} className="bar-col" title={`${day.label}: ${playtime(day.value)}`}>
                  <div className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ height: `${Math.max(day.value ? 8 : 3, (day.value / weekMax) * 100)}%` }}
                    />
                  </div>
                  <span className="bar-label">{day.label}</span>
                </div>
              ))}
            </div>
            <div className="week-foot">
              <span>All time</span>
              <strong>{playtime(animatedAllTime)}</strong>
            </div>
          </Glass>

          <Glass matte className="side-tile auto-tile" onClick={() => navigate('downloads')}>
            <div className="side-tile-icon">
              <DownloadCloud size={18} />
            </div>
            <div>
              <strong>{autoStatus?.running ? 'Auto downloader working' : t('home.autoReady')}</strong>
              <span>{autoStatus?.message ?? 'Missing files are prepared in the background'}</span>
            </div>
            <button
              type="button"
              className="icon-btn icon-btn--xs"
              title="Run now"
              onClick={(event) => {
                event.stopPropagation()
                void runAutoCheck()
              }}
            >
              <RefreshCw size={13} />
            </button>
          </Glass>

          <Glass
            matte
            className="side-tile"
            role="button"
            tabIndex={0}
            onClick={() => navigate('browse')}
          >
            <div className="side-tile-icon">
              <Compass size={18} />
            </div>
            <div>
              <strong>Find your next adventure</strong>
              <span>Mods, packs, shaders and more</span>
            </div>
            <ArrowUpRight size={15} className="side-tile-arrow" />
          </Glass>
        </div>
      </div>

      <div className="stat-grid">
        <Glass matte className="stat-card">
          <div className="stat-icon">
            <Boxes size={17} />
          </div>
          <div>
            <span className="card-label">Instances</span>
            <strong className="stat-value">{animatedInstances}</strong>
            <span className="stat-sub">across every loader</span>
          </div>
        </Glass>
        <Glass matte className="stat-card">
          <div className="stat-icon">
            <Package size={17} />
          </div>
          <div>
            <span className="card-label">Mods installed</span>
            <strong className="stat-value">{animatedMods}</strong>
            <span className="stat-sub">managed locally</span>
          </div>
        </Glass>
        <Glass matte className="stat-card">
          <div className="stat-icon">
            <Clock size={17} />
          </div>
          <div>
            <span className="card-label">Playtime</span>
            <strong className="stat-value">{playtime(animatedAllTime)}</strong>
            <span className="stat-sub">{compact(stats.sessions.length)} sessions tracked</span>
          </div>
        </Glass>
      </div>

      <section className="home-section">
        <header className="section-head">
          <div>
            <h2>Trending mods</h2>
            <p>What the community is playing right now.</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => navigate('browse')}>
            Browse all <ArrowUpRight size={13} />
          </button>
        </header>
        <div className="project-grid project-grid--compact">
          {trendingLoading &&
            Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton-card" />)}
          {!trendingLoading &&
            trending.slice(0, 8).map((project) => (
              <ProjectCard key={project.project_id} project={project} type="mod" compactCard />
            ))}
        </div>
      </section>

      {favorites.length > 0 && (
        <section className="home-section">
          <header className="section-head">
            <div>
              <h2>{t('home.favorites')}</h2>
              <p>Your pinned worlds, always one click away.</p>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => navigate('library')}>
              See all <ArrowUpRight size={13} />
            </button>
          </header>
          <div className="instance-grid">
            {favorites.slice(0, 4).map((instance) => (
              <InstanceTile key={instance.id} instance={instance} />
            ))}
          </div>
        </section>
      )}

      {instances.length > 0 && (
        <section className="home-section">
          <header className="section-head">
            <div>
              <h2>Your instances</h2>
              <p>Jump back into a world.</p>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => navigate('library')}>
              Open library <ArrowUpRight size={13} />
            </button>
          </header>
          <div className="instance-grid">
            {[...instances]
              .sort((a, b) => (b.lastPlayed ?? b.created) - (a.lastPlayed ?? a.created))
              .slice(0, 4)
              .map((instance) => (
                <InstanceTile key={instance.id} instance={instance} />
              ))}
          </div>
        </section>
      )}
    </div>
  )
}
