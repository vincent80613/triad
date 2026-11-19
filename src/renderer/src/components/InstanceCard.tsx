import { memo, type CSSProperties } from 'react'
import { Clock, Play, Star } from 'lucide-react'
import type { Instance } from '@shared/types'
import { api } from '../api'
import { useApp } from '../store'
import { cn, loaderLabel, playtime, relativeTime, tagColor } from '../lib/format'
import { playInstance } from '../lib/launch'
import { Glass } from './Glass'

export const InstanceTile = memo(function InstanceTile({ instance }: { instance: Instance }) {
  const openInstance = useApp((state) => state.openInstance)
  const launch = useApp((state) => state.launch)
  const showPlaytime = useApp((state) => state.settings.showCardPlaytime)
  const refreshInstances = useApp((state) => state.refreshInstances)
  const pushToast = useApp((state) => state.pushToast)
  const running =
    launch.instanceId === instance.id &&
    (launch.status === 'running' || launch.status === 'preparing' || launch.status === 'stopping')

  return (
    <Glass
      matte
      className={cn('instance-card', running && 'is-running')}
      onClick={() => openInstance(instance.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') openInstance(instance.id)
      }}
    >
      <div className="instance-top">
        <div
          className="instance-icon"
          style={{
            background: `linear-gradient(145deg, color-mix(in srgb, ${instance.tint} 48%, transparent), rgb(255 255 255 / 0.04))`
          }}
        >
          {instance.icon.startsWith('http') ? (
            <img src={instance.icon} alt="" decoding="async" />
          ) : (
            <span>{instance.icon}</span>
          )}
        </div>
        <div className="instance-state">
          <button
            type="button"
            className={cn('instance-favorite', instance.favorite && 'active')}
            title={instance.favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={instance.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={(event) => {
              event.stopPropagation()
              void api.instances
                .update(instance.id, { favorite: !instance.favorite })
                .then(() => refreshInstances())
                .catch(() =>
                  pushToast({ title: 'Could not update favorite', variant: 'error' })
                )
            }}
          >
            <Star size={14} fill={instance.favorite ? 'currentColor' : 'none'} />
          </button>
          {running ? (
            <span className="chip chip--ok">
              <span className="live-dot" /> Playing
            </span>
          ) : (
            <span className="instance-last">{relativeTime(instance.lastPlayed ?? instance.created)}</span>
          )}
        </div>
      </div>

      <div className="instance-copy">
        <h3>{instance.name}</h3>
        <div className="instance-meta">
          <span>{instance.mcVersion}</span>
          <i />
          <span>{loaderLabel(instance.loader)}</span>
          {instance.group && (
            <>
              <i />
              <span className="instance-group">{instance.group}</span>
            </>
          )}
        </div>
        {!!instance.tags?.length && (
          <div className="instance-tags">
            {instance.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="instance-tag"
                style={{ '--tag-color': tagColor(tag) } as CSSProperties}
              >
                {tag}
              </span>
            ))}
            {instance.tags.length > 3 && <span className="instance-tag more">+{instance.tags.length - 3}</span>}
          </div>
        )}
      </div>

      <div className="instance-foot">
        <span className="instance-playtime">
          {showPlaytime ? (
            <>
              <Clock size={12} /> {playtime(instance.playtimeMs)}
            </>
          ) : (
            <span className="instance-ready">Ready to play</span>
          )}
        </span>
        <button
          type="button"
          className="instance-play"
          aria-label={`Play ${instance.name}`}
          onClick={(event) => {
            event.stopPropagation()
            playInstance(instance.id)
          }}
        >
          <Play size={15} fill="currentColor" />
        </button>
      </div>
    </Glass>
  )
})
