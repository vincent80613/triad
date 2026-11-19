import { memo } from 'react'
import { Boxes, Download } from 'lucide-react'
import type { ModrinthSearchHit, ProjectType } from '@shared/types'
import { useApp } from '../store'
import { cn, compact } from '../lib/format'
import { Glass } from './Glass'

export const ProjectCard = memo(function ProjectCard({
  project,
  type,
  compactCard
}: {
  project: ModrinthSearchHit
  type: ProjectType
  compactCard?: boolean
}) {
  const openProject = useApp((state) => state.openProject)
  return (
    <Glass
      matte
      className={cn('project-card', compactCard && 'project-card--compact')}
      role="button"
      tabIndex={0}
      onClick={() => openProject(project.project_id, type)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') openProject(project.project_id, type)
      }}
    >
      <div className="project-icon">
        {project.icon_url ? (
          <img src={project.icon_url} alt="" loading="lazy" decoding="async" />
        ) : (
          <Boxes size={22} />
        )}
      </div>
      <div className="project-copy">
        <h3>{project.title}</h3>
        <span className="project-author">by {project.author || 'a creator'}</span>
        <p className="project-desc">{project.description}</p>
        <div className="project-foot">
          <div className="project-tags">
            {project.categories
              .filter((category) => !['fabric', 'forge', 'neoforge', 'quilt'].includes(category))
              .slice(0, 2)
              .map((category) => (
                <span key={category} className="tag">
                  {category}
                </span>
              ))}
          </div>
          <span className="project-downloads">
            <Download size={11} /> {compact(project.downloads)}
          </span>
        </div>
      </div>
    </Glass>
  )
})
