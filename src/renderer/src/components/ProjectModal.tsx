import { useEffect, useMemo, useState } from 'react'
import {
  Boxes,
  Check,
  Download,
  ExternalLink,
  FolderPlus,
  Image,
  Layers,
  RefreshCw,
  Users,
  X
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  ModrinthProject,
  ModrinthVersion,
  ProjectType,
  Settings
} from '@shared/types'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { cn, compact, relativeTime, shortDate } from '../lib/format'
import { Chip, ProgressBar, Select, Spinner } from './Controls'
import { Modal } from './Modal'

const TYPE_LABEL: Record<ProjectType, string> = {
  mod: 'mod',
  modpack: 'modpack',
  resourcepack: 'resource pack',
  shader: 'shader pack'
}

function tintFor(color: number | null): string {
  if (!color || color < 0) return '#8f7bff'
  return `#${color.toString(16).padStart(6, '0').slice(-6)}`
}

function versionTone(type: string): 'ok' | 'warn' | 'danger' | 'muted' {
  if (type === 'release') return 'ok'
  if (type === 'beta') return 'warn'
  if (type === 'alpha') return 'danger'
  return 'muted'
}

export function ProjectModal() {
  const modal = useApp((state) => state.projectModal)
  const close = useApp((state) => state.closeProject)

  return (
    <Modal open={!!modal} onClose={close} className="project-modal" label="Project details">
      {modal && <ProjectSheet id={modal.id} type={modal.projectType} onClose={close} />}
    </Modal>
  )
}

function ProjectSheet({
  id,
  type,
  onClose
}: {
  id: string
  type: ProjectType
  onClose: () => void
}) {
  const instances = useApp((state) => state.instances)
  const activeInstanceId = useApp((state) => state.activeInstanceId)
  const settings = useApp((state) => state.settings)
  const pushToast = useApp((state) => state.pushToast)
  const setNewInstanceOpen = useApp((state) => state.setNewInstanceOpen)
  const navigate = useApp((state) => state.navigate)
  const openInstance = useApp((state) => state.openInstance)
  const [project, setProject] = useState<ModrinthProject | null>(null)
  const [versions, setVersions] = useState<ModrinthVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'description' | 'gallery' | 'versions'>('description')
  const [targetId, setTargetId] = useState(activeInstanceId ?? instances[0]?.id ?? '')
  const [versionId, setVersionId] = useState('')
  const [installing, setInstalling] = useState(false)

  const target = instances.find((instance) => instance.id === targetId)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    void Promise.all([api.modrinth.project(id), api.modrinth.versions(id)])
      .then(([nextProject, nextVersions]) => {
        if (cancelled) return
        setProject(nextProject)
        setVersions(nextVersions)
      })
      .catch((loadError) => {
        if (!cancelled) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const compatibleVersions = useMemo(() => {
    if (!project) return []
    if (type === 'modpack') return versions
    if (!target) return []
    return versions.filter((version) => {
      if (!version.game_versions.includes(target.mcVersion)) return false
      if (type === 'mod') {
        return target.loader !== 'vanilla' && version.loaders.includes(target.loader)
      }
      return true
    })
  }, [project, versions, target, type])

  useEffect(() => {
    setVersionId(compatibleVersions[0]?.id ?? '')
  }, [compatibleVersions.map((version) => version.id).join(':')])

  useEffect(() => {
    if (!targetId && instances.length) setTargetId(instances[0].id)
  }, [instances, targetId])

  const selectedVersion = compatibleVersions.find((version) => version.id === versionId)

  async function install(explicitVersionId?: string) {
    if (!selectedVersion && !explicitVersionId) return
    const chosen = explicitVersionId ?? versionId
    setInstalling(true)
    try {
      if (type === 'modpack') {
        await api.modrinth.installModpack(id, chosen)
        pushToast({
          title: 'Modpack queued',
          description: 'A new instance is being created. Watch the downloads panel.',
          variant: 'success'
        })
        onClose()
        navigate('downloads')
      } else {
        if (!target) {
          pushToast({
            title: 'No instance selected',
            description: 'Create an instance before installing content.',
            variant: 'error'
          })
          return
        }
        if (type === 'mod' && target.loader === 'vanilla') {
          pushToast({
            title: 'This instance is vanilla',
            description: 'Mods need Fabric, Quilt, Forge or NeoForge. Create a modded instance first.',
            variant: 'error'
          })
          return
        }
        await api.modrinth.install(target.id, id, chosen)
        pushToast({
          title: `Installing ${project?.title ?? 'content'}`,
          description: target ? `Adding to ${target.name}.` : undefined,
          variant: 'success'
        })
        onClose()
      }
    } catch (installError) {
      pushToast({
        title: 'Could not start the install',
        description: errorMessage(installError),
        variant: 'error'
      })
    } finally {
      setInstalling(false)
    }
  }

  const tint = project ? tintFor(project.color) : 'var(--accent)'
  const banner = project?.gallery?.find((image) => image.featured)?.url ?? project?.gallery?.[0]?.url
  const disabledInstall =
    installing || !selectedVersion || (type !== 'modpack' && (!target || (type === 'mod' && target.loader === 'vanilla')))

  return (
    <>
      <div
        className="project-banner"
        style={{
          backgroundImage: banner
            ? `linear-gradient(180deg, rgb(8 6 16 / 0.25), rgb(10 8 20 / 0.92)), url("${banner}")`
            : `radial-gradient(120% 140% at 15% 0%, color-mix(in srgb, ${tint} 55%, transparent), transparent 65%), linear-gradient(140deg, color-mix(in srgb, ${tint} 26%, #0b0912), #0b0912)`
        }}
      >
        <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
          <X size={17} />
        </button>
        {loading ? (
          <div className="project-hero-skeleton">
            <Spinner size={20} />
          </div>
        ) : project ? (
          <div className="project-hero">
            <div className="project-hero-icon" style={{ boxShadow: `0 18px 50px -18px ${tint}` }}>
              {project.icon_url ? <img src={project.icon_url} alt="" /> : <Boxes size={30} />}
            </div>
            <div className="project-hero-copy">
              <div className="eyebrow">{TYPE_LABEL[type]}</div>
              <h2>{project.title}</h2>
              <p>{project.description}</p>
              <div className="project-hero-meta">
                <span>
                  <Download size={12} /> {compact(project.downloads)}
                </span>
                <span>
                  <Users size={12} /> {compact(project.followers)}
                </span>
                <span>Updated {relativeTime(new Date(project.updated).getTime())}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="project-error">
          <p>{error}</p>
          <button type="button" className="btn btn-sm" onClick={() => setTab('description')}>
            <RefreshCw size={13} /> Retry by reopening
          </button>
        </div>
      ) : loading || !project ? (
        <div className="project-loading">
          <Spinner size={22} />
          <span>Loading project…</span>
        </div>
      ) : (
        <>
          <div className="project-tabs">
            <div className="tabs" role="tablist">
              {(
                [
                  ['description', 'Description'],
                  ['gallery', `Gallery${project.gallery.length ? ` ${project.gallery.length}` : ''}`],
                  ['versions', `Versions ${versions.length}`]
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  className={cn('tab', tab === key && 'active')}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="project-content">
            <div className="project-main">
              {tab === 'description' && (
                <div className="prose">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          onClick={(event) => {
                            event.preventDefault()
                            if (href) void api.app.openExternal(href)
                          }}
                        >
                          {children}
                        </a>
                      )
                    }}
                  >
                    {project.body || project.description}
                  </ReactMarkdown>
                </div>
              )}

              {tab === 'gallery' && (
                <div className="gallery">
                  {project.gallery.length === 0 && (
                    <p className="muted">This project has no gallery images.</p>
                  )}
                  {project.gallery.map((image) => (
                    <button
                      key={image.url}
                      type="button"
                      className="gallery-item"
                      onClick={() => void api.app.openExternal(image.url)}
                      title={image.title || 'Open image'}
                    >
                      <img src={image.url} alt={image.title ?? ''} loading="lazy" />
                      {image.title && <span>{image.title}</span>}
                    </button>
                  ))}
                </div>
              )}

              {tab === 'versions' && (
                <div className="version-list">
                  {versions.length === 0 && <p className="muted">No versions published yet.</p>}
                  {versions.slice(0, 50).map((version) => {
                    const compatible = compatibleVersions.some((entry) => entry.id === version.id)
                    return (
                      <div key={version.id} className="version-row">
                        <div className="version-copy">
                          <div className="version-title">
                            <strong>{version.version_number}</strong>
                            <Chip tone={versionTone(version.version_type)}>{version.version_type}</Chip>
                            {compatible && <Chip tone="accent">Compatible</Chip>}
                          </div>
                          <span className="version-meta">
                            {version.game_versions.slice(0, 4).join(', ')}
                            {version.game_versions.length > 4 ? ` +${version.game_versions.length - 4}` : ''}
                            {version.loaders.length ? ` · ${version.loaders.join(', ')}` : ''}
                          </span>
                        </div>
                        <span className="version-downloads">{compact(version.downloads)}</span>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={!compatible || installing}
                          onClick={() => void install(version.id)}
                        >
                          Install
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <aside className="project-rail">
              <div className="rail-box">
                <div className="rail-head">
                  <Layers size={14} /> Install
                </div>
                {type !== 'modpack' && (
                  <>
                    {instances.length === 0 ? (
                      <div className="rail-empty">
                        <p>Create an instance first, then install straight into it.</p>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            onClose()
                            setNewInstanceOpen(true)
                          }}
                        >
                          <FolderPlus size={13} /> New instance
                        </button>
                      </div>
                    ) : (
                      <label className="rail-field">
                        <span>Target instance</span>
                        <Select value={targetId} onChange={setTargetId} ariaLabel="Target instance">
                          {instances.map((instance) => (
                            <option key={instance.id} value={instance.id}>
                              {instance.name} · {instance.mcVersion}
                            </option>
                          ))}
                        </Select>
                      </label>
                    )}
                    {target && target.loader === 'vanilla' && type === 'mod' && (
                      <p className="rail-warn">Vanilla cannot load mods — pick a modded instance.</p>
                    )}
                  </>
                )}
                <label className="rail-field">
                  <span>{type === 'modpack' ? 'Pack version' : 'Version'}</span>
                  <Select value={versionId} onChange={setVersionId} ariaLabel="Version">
                    {compatibleVersions.length === 0 && <option value="">No compatible version</option>}
                    {compatibleVersions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.version_number} · {version.version_type}
                      </option>
                    ))}
                  </Select>
                </label>
                {type === 'modpack' && (
                  <p className="rail-note">Creates a new instance with this pack's loader and Minecraft version.</p>
                )}
                <button
                  type="button"
                  className="btn btn-primary rail-install"
                  disabled={disabledInstall}
                  onClick={() => void install()}
                >
                  {installing ? <Spinner size={14} /> : <Download size={15} />}
                  {installing ? 'Starting…' : `Install ${TYPE_LABEL[type]}`}
                </button>
                {selectedVersion && <ProgressBar value={0} className="rail-progress" />}
              </div>

              <div className="rail-box">
                <div className="rail-head">Details</div>
                <dl className="rail-details">
                  <div>
                    <dt>Published</dt>
                    <dd>{shortDate(project.published)}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{shortDate(project.updated)}</dd>
                  </div>
                  <div>
                    <dt>License</dt>
                    <dd>{project.license?.name ?? 'Unknown'}</dd>
                  </div>
                  <div>
                    <dt>Environment</dt>
                    <dd>{project.client_side === 'required' ? 'Client' : project.client_side}</dd>
                  </div>
                </dl>
                <div className="rail-tags">
                  {project.categories.slice(0, 8).map((category) => (
                    <span key={category} className="tag">
                      {category}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rail-box">
                <div className="rail-head">Links</div>
                <div className="rail-links">
                  {project.source_url && (
                    <button type="button" onClick={() => void api.app.openExternal(project.source_url!)}>
                      <ExternalLink size={13} /> Source
                    </button>
                  )}
                  {project.issues_url && (
                    <button type="button" onClick={() => void api.app.openExternal(project.issues_url!)}>
                      <ExternalLink size={13} /> Issues
                    </button>
                  )}
                  {project.wiki_url && (
                    <button type="button" onClick={() => void api.app.openExternal(project.wiki_url!)}>
                      <ExternalLink size={13} /> Wiki
                    </button>
                  )}
                  {project.discord_url && (
                    <button type="button" onClick={() => void api.app.openExternal(project.discord_url!)}>
                      <ExternalLink size={13} /> Discord
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void api.app.openExternal(`https://modrinth.com/project/${project.slug}`)}
                  >
                    <ExternalLink size={13} /> Project page
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}
    </>
  )
}
