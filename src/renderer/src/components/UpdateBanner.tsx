import { useEffect, useState } from 'react'
import { DownloadCloud, Rocket } from 'lucide-react'
import type { UpdaterStatus } from '@shared/types'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { Glass } from './Glass'
import { ProgressBar, Spinner } from './Controls'

const VISIBLE_PHASES: UpdaterStatus['phase'][] = ['available', 'downloading', 'ready']

export function UpdateBanner() {
  const pushToast = useApp((state) => state.pushToast)
  const [status, setStatus] = useState<UpdaterStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void api.updater
      .status()
      .then((next) => {
        if (active) setStatus(next)
      })
      .catch(() => undefined)
    const unsubscribe = api.on.updater((next) => setStatus(next))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (!status || !VISIBLE_PHASES.includes(status.phase)) return null

  const version = status.version ? ` ${status.version}` : ''

  async function download(): Promise<void> {
    setBusy(true)
    try {
      const next = await api.updater.download()
      setStatus(next)
      if (next.phase === 'error') {
        pushToast({ title: 'Could not download update', description: next.message, variant: 'error' })
      }
    } catch (error) {
      pushToast({ title: 'Could not download update', description: errorMessage(error), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function install(): Promise<void> {
    setBusy(true)
    try {
      await api.updater.install()
    } catch (error) {
      pushToast({ title: 'Could not install update', description: errorMessage(error), variant: 'error' })
      setBusy(false)
    }
  }

  const title =
    status.phase === 'ready'
      ? `Triad${version} is ready to install`
      : status.phase === 'downloading'
        ? `Downloading Triad${version}`
        : `Triad${version} is available`

  const description =
    status.phase === 'ready'
      ? 'Restart the launcher to finish updating. Patch notes will appear when Triad reopens.'
      : status.phase === 'downloading'
        ? 'You can keep using Triad while the update downloads.'
        : 'Download it now, then restart when you are ready. Patch notes will appear after the restart.'

  return (
    <Glass strong className="launcher-update-banner" aria-live="polite">
      <span className="launcher-update-banner-icon" aria-hidden>
        {status.phase === 'downloading' ? <Spinner size={18} /> : <DownloadCloud size={19} />}
      </span>
      <div className="launcher-update-banner-copy">
        <span className="eyebrow">Launcher update</span>
        <strong>{title}</strong>
        <span>{description}</span>
        {status.phase === 'downloading' && (
          <ProgressBar value={status.percent === undefined ? null : status.percent / 100} />
        )}
      </div>
      <div className="launcher-update-banner-actions">
        {status.phase === 'available' && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void download()}>
            {busy ? <Spinner size={13} /> : <DownloadCloud size={13} />}
            Update
          </button>
        )}
        {status.phase === 'downloading' && (
          <span className="launcher-update-banner-percent">
            {status.percent === undefined ? 'Downloading…' : `${Math.round(status.percent)}%`}
          </span>
        )}
        {status.phase === 'ready' && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void install()}>
            {busy ? <Spinner size={13} /> : <Rocket size={13} />}
            Restart &amp; update
          </button>
        )}
      </div>
    </Glass>
  )
}
