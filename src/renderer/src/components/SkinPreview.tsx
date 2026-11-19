import { useEffect, useRef } from 'react'
import type { SkinVariant } from '@shared/types'


function drawFront(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: [number, number, number, number],
  destination: [number, number, number, number],
  legacyMirror = false
): void {
  const [sx, sy, sw, sh] = source
  const [dx, dy, dw, dh] = destination
  if (!legacyMirror) {
    context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
    return
  }
  context.save()
  context.translate(dx + dw, dy)
  context.scale(-1, 1)
  context.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh)
  context.restore()
}

export function SkinPreview({
  src,
  variant,
  className,
  label,
  compact = false
}: {
  src: string
  variant: SkinVariant
  className?: string
  label?: string
  compact?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const scale = compact ? 5 : 10
    const width = compact ? 120 : 240
    const height = compact ? 170 : 340
    const xOffset = compact ? 10 : 20
    const yOffset = compact ? 5 : 10
    let cancelled = false
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      if (cancelled) return
      context.clearRect(0, 0, width, height)
      context.imageSmoothingEnabled = false
      const armWidth = variant === 'slim' ? 3 : 4
      const rightArmX = 44
      const leftArmX = 36
      const legacy = image.height <= 32

      // Legs
      drawFront(context, image, [4, 20, 4, 12], [6 * scale + xOffset, 20 * scale + yOffset, 4 * scale, 12 * scale])
      drawFront(
        context,
        image,
        legacy ? [4, 20, 4, 12] : [20, 52, 4, 12],
        [10 * scale + xOffset, 20 * scale + yOffset, 4 * scale, 12 * scale],
        legacy
      )
      // Torso
      drawFront(context, image, [20, 20, 8, 12], [6 * scale + xOffset, 8 * scale + yOffset, 8 * scale, 12 * scale])
      // Arms
      drawFront(
        context,
        image,
        [rightArmX, 20, armWidth, 12],
        [2 * scale + xOffset, 8 * scale + yOffset, armWidth * scale, 12 * scale]
      )
      drawFront(
        context,
        image,
        legacy ? [rightArmX, 20, armWidth, 12] : [leftArmX, 52, armWidth, 12],
        [(18 - armWidth) * scale + xOffset, 8 * scale + yOffset, armWidth * scale, 12 * scale],
        legacy
      )
      // Head
      drawFront(context, image, [8, 8, 8, 8], [6 * scale + xOffset, yOffset, 8 * scale, 8 * scale])
    }
    image.src = src
    return () => {
      cancelled = true
    }
  }, [src, variant, compact])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={compact ? 120 : 240}
      height={compact ? 170 : 340}
      role={label ? 'img' : undefined}
      aria-label={label}
    />
  )
}
