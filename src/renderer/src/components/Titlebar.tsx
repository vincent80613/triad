import { Minus, Search, Square, X, Download } from 'lucide-react'
import { useApp } from '../store'
import { cn } from '../lib/format'
import logo from '../assets/logo.svg'

export function Titlebar() {
  const setPaletteOpen = useApp((state) => state.setPaletteOpen)
  const tasks = useApp((state) => state.tasks)
  const appInfo = useApp((state) => state.appInfo)
  const launch = useApp((state) => state.launch)
  const running = tasks.filter((task) => task.status === 'running').length
  const isMac = appInfo?.platform === 'darwin'

  return (
    <header className="titlebar">
      <div className="brand">
        <img className="brand-logo" src={logo} alt="" />
        <span className="brand-name">Triad</span>
        <span className="brand-badge">LAUNCHER</span>
      </div>

      <button
        type="button"
        className="tb-search"
        onClick={() => setPaletteOpen(true)}
        aria-label="Open command palette"
      >
        <Search size={13} />
        <span>Search mods, instances, actions…</span>
        <span className="kbd">CTRL K</span>
      </button>

      <div className="tb-right">
        {launch.status === 'running' && (
          <span className="tb-pill">
            <span className="live-dot" /> In game
          </span>
        )}
        {running > 0 && (
          <span className="tb-pill">
            <Download size={12} /> {running} active
          </span>
        )}
        {!isMac && (
          <div className="win-controls">
            <button
              type="button"
              className="win-btn"
              aria-label="Minimize"
              onClick={() => window.api.window.minimize()}
            >
              <Minus size={15} />
            </button>
            <button
              type="button"
              className="win-btn"
              aria-label="Maximize"
              onClick={() => window.api.window.toggleMaximize()}
            >
              <Square size={11} />
            </button>
            <button
              type="button"
              className={cn('win-btn', 'win-close')}
              aria-label="Close"
              onClick={() => window.api.window.close()}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
