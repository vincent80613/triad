import type { CSSProperties, ReactNode } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '../lib/format'

export function Field({
  label,
  hint,
  children,
  className,
  htmlFor
}: {
  label?: string
  hint?: string
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('field', className)}>
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

export function Select({
  value,
  onChange,
  children,
  disabled,
  ariaLabel,
  className
}: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={cn('select-wrap', className)}>
      <select
        className="input select"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      <ChevronDown size={14} className="select-chevron" />
    </div>
  )
}

export function Chip({
  children,
  tone,
  className
}: {
  children: ReactNode
  tone?: 'accent' | 'ok' | 'warn' | 'danger' | 'muted'
  className?: string
}) {
  return <span className={cn('chip', tone && `chip--${tone}`, className)}>{children}</span>
}

export function Spinner({ size = 15, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('spin', className)} />
}

export function ProgressBar({
  value,
  className
}: {
  value?: number | null
  className?: string
}) {
  return (
    <div className={cn('progress', className)} data-indeterminate={value === null || value === undefined}>
      <span style={{ width: value === null || value === undefined ? '38%' : `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <div className="toggle-row">
      <div className="toggle-copy">
        <span className="toggle-title">{label}</span>
        {description && <span className="toggle-desc">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={cn('toggle', checked && 'on')}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
  display,
  disabled
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  suffix?: string
  display?: string
  disabled?: boolean
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="slider-row">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--fill': `${pct}%` } as CSSProperties}
        aria-label="Slider"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="slider-value">
        {display ?? value}
        {suffix && <em>{suffix}</em>}
      </span>
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('segmented', className)} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={cn(value === option.value && 'active')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('empty', className)}>
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}
