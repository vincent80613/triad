import { ArrowRight, Sparkles } from 'lucide-react'
import type { ReleaseNote } from '@shared/releaseNotes'
import { Modal, ModalHeader } from './Modal'

export function WhatsNewModal({
  notes,
  onClose
}: {
  notes: ReleaseNote | null
  onClose: () => void
}) {
  if (!notes) return null

  return (
    <Modal
      open
      onClose={onClose}
      className="whats-new-modal"
      label={`What's new in Triad ${notes.version}`}
    >
      <ModalHeader
        icon={<Sparkles size={18} />}
        title="What's new in Triad"
        subtitle={`Version ${notes.version} · ${notes.title}`}
        onClose={onClose}
      />
      <div className="whats-new-body">
        {notes.sections.map((section) => (
          <section className="whats-new-section" key={section.title}>
            <h3>{section.title}</h3>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <footer className="modal-foot">
        <span className="modal-foot-hint">Shown once after each launcher update.</span>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Continue <ArrowRight size={14} />
        </button>
      </footer>
    </Modal>
  )
}
