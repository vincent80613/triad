import { Check, CircleAlert, Info, X } from 'lucide-react'
import { useApp } from '../store'

export function Toasts() {
  const toasts = useApp((state) => state.toasts)
  const dismiss = useApp((state) => state.dismissToast)

  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => {
        const Icon =
          toast.variant === 'error' ? CircleAlert : toast.variant === 'success' ? Check : Info
        return (
          <div key={toast.id} className={`toast glass glass--strong toast--${toast.variant ?? 'default'}`}>
            <div className="toast-icon">
              <Icon size={16} />
            </div>
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.description && <span>{toast.description}</span>}
            </div>
            <button
              type="button"
              className="icon-btn icon-btn--xs toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
