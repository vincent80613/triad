import { useEffect, useState } from 'react'
import {
  Check,
  CircleAlert,
  Download,
  DownloadCloud,
  ExternalLink,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react'
import { useApp } from '../store'
import { api, errorMessage } from '../api'
import { useT } from '../i18n'
import { cn, percent } from '../lib/format'
import { Glass } from '../components/Glass'
import { EmptyState, ProgressBar, Spinner } from '../components/Controls'

export function Downloads() {
  const t = useT()
  const tasks = useApp((state) => state.tasks)
  const autoStatus = useApp((state) => state.autoStatus)
  const refreshAutoStatus = useApp((state) => state.refreshAutoStatus)
  const pushToast = useApp((state) => state.pushToast)
  const [autoRunning, setAutoRunning] = useState(false)
  const navigate = useApp((state) => state.navigate)
  const setBrowse = useApp((state) => state.setBrowse)
  const openInstance = useApp((state) => state.openInstance)
  const cancelTask = useApp((state) => state.cancelTask)
  const dismissTask = useApp((state) => state.dismissTask)
  const running = tasks.filter((task) => task.status === 'running')
  const finished = tasks.filter((task) => task.status !== 'running')

  useEffect(() => {
    void refreshAutoStatus().catch(() => undefined)
  }, [])

  async function runAuto(): Promise<void> {
    setAutoRunning(true)
    try {
      const status = await api.auto.run()
      await refreshAutoStatus()
      pushToast({ title: 'Auto downloader', description: status.message, variant: 'success' })
    } catch (error) {
      pushToast({ title: 'Auto downloader failed', description: errorMessage(error), variant: 'error' })
    } finally {
      setAutoRunning(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-heading">
          <div className="eyebrow">
            <Download size={11} /> Activity
          </div>
          <h1 className="page-title">Downloads</h1>
          <p className="page-sub">
            Installs, updates and modpack extractions happen here — keep playing while they run.
          </p>
        </div>
        {running.length > 0 && (
          <div className="page-actions">
            <span className="tb-pill">
              <Spinner size={12} /> {running.length} active
            </span>
          </div>
        )}
      </div>

      <Glass className="downloads-auto-card">
        <div className="downloads-auto-icon">
          <DownloadCloud size={21} />
        </div>
        <div className="downloads-auto-copy">
          <div className="downloads-auto-title">
            <strong>{t('downloads.auto')}</strong>
            <span className={cn('auto-status-dot', (autoStatus?.running || autoRunning) && 'active')} />
          </div>
          <span>{autoStatus?.message ?? 'Checks your instances for missing game files.'}</span>
          <span className="muted small">
            {autoStatus?.lastRun
              ? `Last run ${new Date(autoStatus.lastRun).toLocaleString()}`
              : 'No automatic run yet'}
            {autoStatus?.nextRun
              ? ` · next ${new Date(autoStatus.nextRun).toLocaleTimeString()}`
              : ''}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={autoRunning || autoStatus?.running}
          onClick={() => void runAuto()}
        >
          {autoRunning || autoStatus?.running ? <Spinner size={13} /> : <RefreshCw size={13} />}
          {autoRunning || autoStatus?.running ? 'Checking…' : t('downloads.runNow')}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate('settings')}>
          Settings
        </button>
      </Glass>

      {tasks.length === 0 ? (
        <Glass className="empty-wrap">
          <EmptyState
            icon={<Download size={22} />}
            title="Nothing downloading"
            description="Install a mod or modpack and progress will show up here."
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setBrowse({ projectType: 'mod', category: '' })
                  navigate('browse')
                }}
              >
                Browse mods
              </button>
            }
          />
        </Glass>
      ) : (
        <div className="download-sections">
          {running.length > 0 && (
            <section>
              <h2 className="section-label">In progress</h2>
              <div className="download-list">
                {running.map((task) => (
                  <Glass key={task.id} className="download-row">
                    <div className="download-icon running">
                      <Spinner size={16} />
                    </div>
                    <div className="download-copy">
                      <div className="download-title-line">
                        <strong>{task.title}</strong>
                        <span className="download-pct">{percent(task.progress)}</span>
                      </div>
                      <span className="download-stage">{task.stage ?? task.subtitle ?? 'Working…'}</span>
                      <ProgressBar value={task.progress} />
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Cancel"
                      onClick={() => void cancelTask(task.id)}
                    >
                      <X size={15} />
                    </button>
                  </Glass>
                ))}
              </div>
            </section>
          )}

          {finished.length > 0 && (
            <section>
              <div className="section-label-row">
                <h2 className="section-label">Recent</h2>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => finished.forEach((task) => void dismissTask(task.id))}
                >
                  <Trash2 size={12} /> Clear
                </button>
              </div>
              <div className="download-list">
                {finished.map((task) => (
                  <Glass key={task.id} className={cn('download-row', `is-${task.status}`)}>
                    <div className={cn('download-icon', task.status)}>
                      {task.status === 'done' ? (
                        <Check size={16} />
                      ) : task.status === 'error' ? (
                        <CircleAlert size={16} />
                      ) : (
                        <X size={16} />
                      )}
                    </div>
                    <div className="download-copy">
                      <div className="download-title-line">
                        <strong>{task.title}</strong>
                        <span className={cn('download-status', task.status)}>
                          {task.status === 'done'
                            ? 'Complete'
                            : task.status === 'error'
                              ? 'Failed'
                              : 'Cancelled'}
                        </span>
                      </div>
                      <span className="download-stage">
                        {task.status === 'error' ? task.error : (task.subtitle ?? task.stage)}
                      </span>
                    </div>
                    {task.status === 'error' && task.kind !== 'launch' && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        title="Browse mods to retry"
                        onClick={() => navigate('browse')}
                      >
                        <RefreshCw size={12} /> Retry
                      </button>
                    )}
                    {task.data?.instanceId && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => openInstance(task.data!.instanceId!)}
                      >
                        <ExternalLink size={12} /> Open
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn icon-btn--xs"
                      title="Dismiss"
                      onClick={() => void dismissTask(task.id)}
                    >
                      <X size={13} />
                    </button>
                  </Glass>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
