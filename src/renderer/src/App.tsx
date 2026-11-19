import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react'
import { api } from './api'
import { useApp } from './store'
import { Titlebar } from './components/Titlebar'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { DownloadsDock } from './components/DownloadsDock'
import { LaunchOverlay } from './components/LaunchOverlay'
import { Home } from './pages/Home'
import { UpdateBanner } from './components/UpdateBanner'
import { WhatsNewModal } from './components/WhatsNewModal'
import { getReleaseNotes, type ReleaseNote } from '@shared/releaseNotes'
import logo from './assets/logo.svg'

const Browse = lazy(() => import('./pages/Browse').then((module) => ({ default: module.Browse })))
const Library = lazy(() => import('./pages/Library').then((module) => ({ default: module.Library })))
const Performance = lazy(() =>
  import('./pages/Performance').then((module) => ({ default: module.Performance }))
)
const InstanceDetail = lazy(() =>
  import('./pages/InstanceDetail').then((module) => ({ default: module.InstanceDetail }))
)
const Downloads = lazy(() =>
  import('./pages/Downloads').then((module) => ({ default: module.Downloads }))
)
const SkinChanger = lazy(() =>
  import('./pages/SkinChanger').then((module) => ({ default: module.SkinChanger }))
)
const Settings = lazy(() =>
  import('./pages/Settings').then((module) => ({ default: module.Settings }))
)
const CommandPalette = lazy(() =>
  import('./components/CommandPalette').then((module) => ({ default: module.CommandPalette }))
)
const ProjectModal = lazy(() =>
  import('./components/ProjectModal').then((module) => ({ default: module.ProjectModal }))
)
const NewInstanceModal = lazy(() =>
  import('./components/NewInstanceModal').then((module) => ({ default: module.NewInstanceModal }))
)
const AccountModal = lazy(() =>
  import('./components/AccountModal').then((module) => ({ default: module.AccountModal }))
)
const SkinStudio = lazy(() =>
  import('./components/SkinStudio').then((module) => ({ default: module.SkinStudio }))
)

function PageLoading() {
  return (
    <div className="page page-loading" aria-busy="true" aria-label="Loading page">
      <div className="page-loading-head">
        <span className="skeleton-line" />
        <span className="skeleton-line" />
        <span className="skeleton-line" />
      </div>
      <div className="page-loading-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="skeleton-card" />
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const ready = useApp((state) => state.ready)
  const init = useApp((state) => state.init)
  const route = useApp((state) => state.route)
  const appInfo = useApp((state) => state.appInfo)
  const settings = useApp((state) => state.settings)
  const paletteOpen = useApp((state) => state.paletteOpen)
  const newInstanceOpen = useApp((state) => state.newInstanceOpen)
  const accountOpen = useApp((state) => state.accountOpen)
  const skinStudioOpen = useApp((state) => state.skinStudioOpen)
  const projectModal = useApp((state) => state.projectModal)
  const setPaletteOpen = useApp((state) => state.setPaletteOpen)
  const [whatsNew, setWhatsNew] = useState<ReleaseNote | null>(null)
  const whatsNewChecked = useRef(false)
  const appRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (!ready || !appInfo || whatsNewChecked.current) return
    whatsNewChecked.current = true
    if (appInfo.lastSeenVersion === appInfo.version) return
    const notes = getReleaseNotes(appInfo.version)
    if (!notes) return
    setWhatsNew(notes)
    // Record the version as soon as the notes are shown, so closing the
    // launcher while the modal is open cannot make them appear a second time.
    void api.app.markVersionSeen()
  }, [ready, appInfo])

  function dismissWhatsNew(): void {
    setWhatsNew(null)
    void api.app.markVersionSeen()
  }

  useEffect(() => {
    api.window.setZoom(settings.fontScale / 100)
  }, [settings.fontScale])

  useEffect(() => {
    const store = useApp.getState()
    const unsubscribers = [
      api.on.task((task) => {
        store.upsertTask(task)
        if (task.status === 'error') {
          useApp.getState().pushToast({
            title: 'Something went wrong',
            description: task.error ?? task.title,
            variant: 'error'
          })
        } else if (task.status === 'done' && task.kind === 'mod') {
          useApp.getState().pushToast({ title: task.title, description: 'Install complete.', variant: 'success' })
        } else if (task.status === 'done' && task.kind === 'install' && task.data?.instanceId) {
          useApp.getState().pushToast({
            title: 'Instance ready',
            description: 'Minecraft files are installed. Hit play when you are ready.',
            variant: 'success'
          })
        }
      }),
      api.on.launchState((state) => useApp.getState().setLaunch(state)),
      api.on.launchLog(({ line }) => useApp.getState().appendLaunchLog(line)),
      api.on.account((account) => useApp.setState({ account })),
      api.on.authDevice((info) => useApp.getState().setDeviceCode(info)),
      api.on.authState((auth) => useApp.getState().setAuth(auth)),
      api.on.dataChanged((scope) => {
        const current = useApp.getState()
        if (scope === 'instances') {
          void current.refreshInstances()
          void current.refreshAutoStatus().catch(() => undefined)
        }
        else if (scope === 'settings') void current.refreshSettings()
        else if (scope === 'account') void current.refreshAccount()
        else if (scope === 'stats') void current.refreshStats()
        else if (scope.startsWith('mods:')) current.bumpMods()
      }),
      api.on.toast((toast) => useApp.getState().pushToast(toast))
    ]
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(!useApp.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen])

  useEffect(() => {
    document.body.classList.toggle('palette-open', paletteOpen)
  }, [paletteOpen])

  useEffect(() => {
    document.querySelector<HTMLElement>('.content')?.scrollTo({ top: 0 })
  }, [route])

  useEffect(() => {
    const root = appRef.current
    if (!root) return

    const syncWindowState = (): void => {
      root.dataset.windowActive =
        document.visibilityState === 'visible' && document.hasFocus() ? 'true' : 'false'
    }

    syncWindowState()
    window.addEventListener('focus', syncWindowState)
    window.addEventListener('blur', syncWindowState)
    document.addEventListener('visibilitychange', syncWindowState)

    return () => {
      window.removeEventListener('focus', syncWindowState)
      window.removeEventListener('blur', syncWindowState)
      document.removeEventListener('visibilitychange', syncWindowState)
    }
  }, [])

  const style = {
    '--glass-blur': `${settings.glassBlur}px`,
    '--tint': settings.glassTint / 100,
    '--radius': `${settings.radius}px`,
    ...(settings.accent ? { '--accent': settings.accent, '--accent-deep': settings.accent } : {})
  } as CSSProperties

  return (
    <div
      ref={appRef}
      className="app"
      data-theme={settings.theme}
      data-wallpaper={settings.wallpaper}
      data-motion={settings.motion ? 'true' : 'false'}
      data-memory-saver={settings.memorySaver ? 'true' : 'false'}
      data-density={settings.uiDensity}
      data-compact-sidebar={settings.sidebarCompact ? 'true' : 'false'}
      data-language={settings.language}
      style={style}
    >
      <div className="wallpaper" aria-hidden>
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
        <span className="wallpaper-streak" />
        <span className="wallpaper-grid" />
      </div>

      {!ready ? (
        <div className="splash">
          <img className="splash-logo" src={logo} alt="" />
          <div className="splash-copy">
            <strong>Triad</strong>
            <span>Your worlds, ready to play.</span>
          </div>
        </div>
      ) : (
        <>
          <Titlebar />
          <div className="shell">
            <Sidebar />
            <main className="content">
              <UpdateBanner />
              <Suspense fallback={<PageLoading />}>
                {route === 'home' && <Home />}
                {route === 'browse' && <Browse />}
                {route === 'performance' && <Performance />}
                {route === 'library' && <Library />}
                {route === 'instance' && <InstanceDetail />}
                {route === 'downloads' && <Downloads />}
                {route === 'skins' && <SkinChanger />}
                {route === 'settings' && <Settings />}
              </Suspense>
            </main>
          </div>
        </>
      )}

      <div className="grain" aria-hidden />
      <Toasts />
      <DownloadsDock />
      <LaunchOverlay />
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
      {projectModal && (
        <Suspense fallback={null}>
          <ProjectModal />
        </Suspense>
      )}
      {newInstanceOpen && (
        <Suspense fallback={null}>
          <NewInstanceModal />
        </Suspense>
      )}
      {accountOpen && (
        <Suspense fallback={null}>
          <AccountModal />
        </Suspense>
      )}
      {skinStudioOpen && (
        <Suspense fallback={null}>
          <SkinStudio />
        </Suspense>
      )}
      <WhatsNewModal notes={whatsNew} onClose={dismissWhatsNew} />
    </div>
  )
}
