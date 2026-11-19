import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/format'

export function Modal({
  open,
  onClose,
  children,
  className,
  label
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  label?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={cn('modal glass glass--strong', className)} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

export function ModalHeader({
  title,
  subtitle,
  onClose,
  icon
}: {
  title: string
  subtitle?: string
  onClose: () => void
  icon?: ReactNode
}) {
  return (
    <header className="modal-head">
      {icon && <div className="modal-head-icon">{icon}</div>}
      <div className="modal-head-copy">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>
    </header>
  )
}
