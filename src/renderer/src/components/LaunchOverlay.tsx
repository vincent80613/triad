import { useEffect, useRef, useState } from 'react'
import { CircleAlert, Play, ScrollText, Square, X } from 'lucide-react'
import { useApp } from '../store'
import { cn, elapsed, percent } from '../lib/format'
import { playInstance, stopGame } from '../lib/launch'
import { ProgressBar, Spinner } from './Controls'

export function LaunchOverlay() {
  const launch = useApp((state) => state.launch)
  const logs = useApp((state) => state.launchLogs)
  const instances = useApp((state) => state.instances)
  const clearLaunch = useApp((state) => state.clearLaunch)
  const [expanded, setExpanded] = useState(false)
  const [now, setNow] = useState(Date.now())
  const logRef = useRef<HTMLPreElement>(null)
  const instance = instances.find((entry) => entry.id === launch.instanceId)

  useEffect(() => {
    if (launch.status !== 'running') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [launch.status])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs, expanded])

  useEffect(() => {
    if (launch.status !== 'running') setExpanded(false)
  }, [launch.status])

  if (launch.status === 'idle') return null

  if (launch.status === 'running') {
    return (
      <div className={cn('launch-running glass glass--strong', expanded && 'expanded')}>
        <div className="launch-running-bar">
          <span className="launch-pulse" />
          <div className="launch-running-copy">
            <strong>Minecraft is running</strong>
            <span>
              {instance?.name ?? 'Instance'} · {elapsed(now - (launch.startedAt ?? now))}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setExpanded((value) => !value)}
          >
            <ScrollText size={14} /> Logs
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={stopGame}>
            <Square size={12} /> Stop
          </button>
        </div>
        {expanded && (
          <pre className="log-view log-view--inline" ref={logRef}>
            {logs.length ? logs.join('\n') : 'Waiting for game output…'}
          </pre>
        )}
      </div>
    )
  }

  if (launch.status === 'error') {
    return (
      <div className="launch-panel glass glass--strong">
        <div className="launch-head">
          <div className="launch-icon error">
            <CircleAlert size={20} />
          </div>
          <div className="launch-copy">
            <h3>Launch failed</h3>
            <p>{launch.error}</p>
          </div>
          <button type="button" className="icon-btn" onClick={clearLaunch} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
        <div className="launch-actions">
          {launch.instanceId && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                clearLaunch()
                playInstance(launch.instanceId!)
              }}
            >
              <Play size={13} /> Try again
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={clearLaunch}>
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  const stopping = launch.status === 'stopping'
  return (
    <div className="launch-panel glass glass--strong">
      <div className="launch-head">
        <div className="launch-icon">
          {stopping ? <Spinner size={20} /> : <span className="launch-orb" />}
        </div>
        <div className="launch-copy">
          <h3>{stopping ? 'Stopping Minecraft' : `Launching ${instance?.name ?? 'Minecraft'}`}</h3>
          <p>{launch.stage ?? 'Preparing…'}</p>
        </div>
        <span className="launch-pct">{percent(launch.progress)}</span>
        <button type="button" className="icon-btn" onClick={clearLaunch} aria-label="Hide progress">
          <X size={15} />
        </button>
      </div>
      <ProgressBar value={launch.progress} />
      <pre className="log-view log-view--inline" ref={logRef}>
        {logs.length ? logs.slice(-8).join('\n') : 'Resolving account, Java and game files…'}
      </pre>
      {!stopping && (
        <div className="launch-actions">
          <button type="button" className="btn btn-sm" onClick={stopGame}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
