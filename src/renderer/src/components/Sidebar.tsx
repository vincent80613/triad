import {
  Compass,
  Download,
  Gauge,
  Home,
  Library,
  Plus,
  Server,
  Settings,
  Shirt,
  Sparkles
} from 'lucide-react'
import type { Route } from '../store'
import { useApp } from '../store'
import { cn, playtime } from '../lib/format'
import { useT } from '../i18n'
import { SkinAvatar } from './SkinAvatar'
import { Glass } from './Glass'

const NAV: { id: Route; label: Parameters<ReturnType<typeof useT>>[0]; icon: typeof Home }[] = [
  { id: 'home', label: 'nav.home', icon: Home },
  { id: 'browse', label: 'nav.browse', icon: Compass },
  { id: 'performance', label: 'nav.performance', icon: Gauge },
  { id: 'library', label: 'nav.library', icon: Library },
  { id: 'hosting', label: 'nav.hosting', icon: Server },
  { id: 'downloads', label: 'nav.downloads', icon: Download },
  { id: 'skins', label: 'nav.skins', icon: Shirt },
  { id: 'settings', label: 'nav.settings', icon: Settings }
]

export function Sidebar() {
  const t = useT()
  const route = useApp((state) => state.route)
  const navigate = useApp((state) => state.navigate)
  const instances = useApp((state) => state.instances)
  const activeInstanceId = useApp((state) => state.activeInstanceId)
  const selectedInstanceId = useApp((state) => state.selectedInstanceId)
  const openInstance = useApp((state) => state.openInstance)
  const account = useApp((state) => state.account)
  const setAccountOpen = useApp((state) => state.setAccountOpen)
  const setNewInstanceOpen = useApp((state) => state.setNewInstanceOpen)
  const tasks = useApp((state) => state.tasks)
  const launch = useApp((state) => state.launch)
  const activeDownloads = tasks.filter((task) => task.status === 'running').length

  let recents = [...instances]
    .sort((a, b) => (b.lastPlayed ?? b.created) - (a.lastPlayed ?? a.created))
    .slice(0, 6)

  if (route === 'instance') {
    const viewed = instances.find(
      (instance) => instance.id === (selectedInstanceId ?? activeInstanceId)
    )
    if (viewed && !recents.some((instance) => instance.id === viewed.id)) {
      recents = [viewed, ...recents].slice(0, 6)
    }
  }

  const highlightedInstanceId = selectedInstanceId ?? activeInstanceId

  return (
    <Glass className="sidebar" flat>
      <nav className="nav" aria-label="Main navigation">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = route === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={cn('nav-item', active && 'active')}
              onClick={() => navigate(item.id)}
              title={t(item.label)}
            >
              <Icon />
              <span className="nav-label">{t(item.label)}</span>
              {item.id === 'downloads' && activeDownloads > 0 && (
                <span className="nav-badge">{activeDownloads}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="side-section">
        <span className="side-title">{t('sidebar.instances')}</span>
        <button
          type="button"
          className="icon-btn icon-btn--xs"
          title={t('nav.newInstance')}
          aria-label="New instance"
          onClick={() => setNewInstanceOpen(true)}
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="mini-instances">
        {recents.length === 0 && (
          <button type="button" className="mini-empty" onClick={() => setNewInstanceOpen(true)}>
            <Sparkles size={13} /> {t('library.empty')}
          </button>
        )}
        {recents.map((instance) => {
          const isActive = highlightedInstanceId === instance.id
          const isRunning =
            launch.instanceId === instance.id &&
            (launch.status === 'running' || launch.status === 'preparing')
          return (
            <button
              key={instance.id}
              type="button"
              className={cn('mini-instance', route === 'instance' && isActive && 'active')}
              style={{ ['--mini-tint' as string]: instance.tint }}
              onClick={() => openInstance(instance.id)}
              title={`${instance.name} · ${instance.mcVersion}${instance.favorite ? ' · favorite' : ''}`}
            >
              <span className="mini-icon">
                {instance.icon.startsWith('http') ? (
                  <img src={instance.icon} alt="" />
                ) : (
                  instance.icon
                )}
                {isRunning && <span className="mini-running" />}
              </span>
              <span className="mini-info">
                <span className="mini-name">
                  {instance.favorite && <span className="mini-favorite">★</span>}
                  {instance.name}
                </span>
                <span className="mini-meta">
                  {instance.mcVersion} · {playtime(instance.playtimeMs)}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        <button
          type="button"
          className="account-chip"
          onClick={() => setAccountOpen(true)}
          title="Account settings"
        >
          <SkinAvatar account={account} size={32} />
          <span className="account-copy">
            <span className="account-name">{account?.name ?? t('sidebar.addAccount')}</span>
            <span className="account-sub">
              {launch.status === 'running' ? (
                <>
                  <span className="live-dot" /> In game
                </>
              ) : account ? (
                account.type === 'microsoft' ? (
                  'Microsoft account'
                ) : (
                  'Offline profile'
                )
              ) : (
                t('sidebar.signIn')
              )}
            </span>
          </span>
        </button>
      </div>
    </Glass>
  )
}
