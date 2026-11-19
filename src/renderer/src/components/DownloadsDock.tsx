import { ChevronUp, Download, X } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../store'
import { cn, percent } from '../lib/format'
import { ProgressBar } from './Controls'

export function DownloadsDock() {
  const tasks = useApp((state) => state.tasks)
  const navigate = useApp((state) => state.navigate)
  const cancelTask = useApp((state) => state.cancelTask)
  const [collapsed, setCollapsed] = useState(false)
  const running = tasks.filter((task) => task.status === 'running')

  if (!running.length) return null

  return (
    <div className={cn('dock glass glass--strong', collapsed && 'collapsed')}>
      <div className="dock-head">
        <div className="dock-title">
          <Download size={13} />
          <span>Downloads</span>
          <span className="dock-count">{running.length}</span>
        </div>
        <div className="dock-actions">
          <button type="button" className="icon-btn icon-btn--xs" onClick={() => navigate('downloads')}>
            View all
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--xs"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand downloads' : 'Collapse downloads'}
          >
            <ChevronUp size={13} className={cn('dock-chevron', collapsed && 'down')} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="dock-list">
          {running.slice(0, 3).map((task) => (
            <div key={task.id} className="dock-item">
              <div className="dock-item-head">
                <span className="dock-item-title">{task.title}</span>
                <span className="dock-item-pct">{percent(task.progress)}</span>
                <button
                  type="button"
                  className="icon-btn icon-btn--xs"
                  onClick={() => void cancelTask(task.id)}
                  aria-label="Cancel download"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="dock-stage">{task.stage ?? 'Working…'}</div>
              <ProgressBar value={task.progress} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
