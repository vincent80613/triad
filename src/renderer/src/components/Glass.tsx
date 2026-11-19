import type { HTMLAttributes } from 'react'
import { cn } from '../lib/format'

interface GlassProps extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean
  flat?: boolean
  matte?: boolean
}

export function Glass({ className, strong, flat, matte, children, ...rest }: GlassProps) {
  return (
    <div
      className={cn(
        'glass',
        strong && 'glass--strong',
        flat && 'glass--flat',
        matte && 'glass--matte',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
