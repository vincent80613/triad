import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Brush,
  Download,
  Eraser,
  Grid3X3,
  PaintBucket,
  Save,
  Trash2,
  Undo2,
  Upload
} from 'lucide-react'
import type { SkinAssets } from '@shared/types'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { useT } from '../i18n'
import { cn } from '../lib/format'
import { Modal, ModalHeader } from './Modal'
import { Segmented, Spinner } from './Controls'

const COLORS = [
  '#ffffff',
  '#d9d9d9',
  '#8d8d8d',
  '#3d3d3d',
  '#161616',
  '#ffb38a',
  '#e59a72',
  '#b96f4b',
  '#8f7bff',
  '#4ea1ff',
  '#2dd4bf',
  '#45e6a8',
  '#f5c451',
  '#ff8a5c',
  '#ff6f91',
  '#c084fc',
  '#d99058',
  '#8b5e34'
]

const SIZES = [1, 2, 4]

type Tool = 'brush' | 'eraser' | 'fill'
type Kind = 'skin' | 'cape'

export function SkinStudio() {
  const open = useApp((state) => state.skinStudioOpen)
  const setOpen = useApp((state) => state.setSkinStudioOpen)
  const pushToast = useApp((state) => state.pushToast)
  const t = useT()
  const [kind, setKind] = useState<Kind>('skin')
  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState('#8f7bff')
  const [brushSize, setBrushSize] = useState(1)
  const [showGrid, setShowGrid] = useState(true)
  const [assets, setAssets] = useState<SkinAssets>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [history, setHistory] = useState<ImageData[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPixel = useRef<{ x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const width = kind === 'skin' ? 64 : 64
  const height = kind === 'skin' ? 64 : 32

  function context(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext('2d', { willReadFrequently: true }) ?? null
  }

  async function loadCurrent(nextKind = kind, nextAssets = assets): Promise<void> {
    const canvas = canvasRef.current
    const ctx = context()
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, width, height)
    const url = nextKind === 'skin' ? nextAssets.skin : nextAssets.cape
    if (!url) {
      setDirty(false)
      return
    }
    await new Promise<void>((resolve) => {
      const image = new Image()
      image.onload = () => {
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(image, 0, 0, width, height)
        resolve()
      }
      image.onerror = () => resolve()
      image.src = url
    })
    setDirty(false)
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setHistory([])
    void api.skins
      .load()
      .then((next) => {
        if (cancelled) return
        setAssets(next)
        void loadCurrent(kind, next)
      })
      .catch((error) => {
        if (!cancelled) {
          pushToast({ title: 'Could not load skins', description: errorMessage(error), variant: 'error' })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setHistory([])
    void loadCurrent(kind, assets)
    // Only react to the selected texture, not every brush stroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, open])

  function snapshot(): void {
    const ctx = context()
    if (!ctx) return
    setHistory((current) => [...current.slice(-24), ctx.getImageData(0, 0, width, height)])
  }

  function pixelAt(event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.floor(((event.clientX - rect.left) / rect.width) * width),
      y: Math.floor(((event.clientY - rect.top) / rect.height) * height)
    }
  }

  function paint(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const ctx = context()
    if (!ctx) return
    const point = pixelAt(event)
    if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) return
    if (lastPixel.current?.x === point.x && lastPixel.current?.y === point.y) return
    lastPixel.current = point
    const offset = Math.floor(brushSize / 2)
    ctx.fillStyle = tool === 'eraser' ? 'rgba(0,0,0,0)' : color
    if (tool === 'eraser') {
      ctx.clearRect(point.x - offset, point.y - offset, brushSize, brushSize)
    } else {
      ctx.fillRect(point.x - offset, point.y - offset, brushSize, brushSize)
    }
    setDirty(true)
  }

  function floodFill(startX: number, startY: number): void {
    const ctx = context()
    if (!ctx) return
    const image = ctx.getImageData(0, 0, width, height)
    const data = image.data
    const index = (x: number, y: number): number => (y * width + x) * 4
    const start = index(startX, startY)
    const target = [data[start], data[start + 1], data[start + 2], data[start + 3]]
    const replacement = tool === 'eraser' ? [0, 0, 0, 0] : hexToRgba(color)
    if (target.every((value, i) => value === replacement[i])) return
    const stack: [number, number][] = [[startX, startY]]
    const seen = new Uint8Array(width * height)
    while (stack.length) {
      const [x, y] = stack.pop()!
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      const position = y * width + x
      if (seen[position]) continue
      seen[position] = 1
      const offset = index(x, y)
      if (
        data[offset] !== target[0] ||
        data[offset + 1] !== target[1] ||
        data[offset + 2] !== target[2] ||
        data[offset + 3] !== target[3]
      ) {
        continue
      }
      data[offset] = replacement[0]
      data[offset + 1] = replacement[1]
      data[offset + 2] = replacement[2]
      data[offset + 3] = replacement[3]
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
    }
    ctx.putImageData(image, 0, 0)
    setDirty(true)
  }

  function beginStroke(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (loading) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = true
    lastPixel.current = null
    snapshot()
    const point = pixelAt(event)
    if (tool === 'fill') {
      floodFill(point.x, point.y)
      drawing.current = false
      return
    }
    paint(event)
  }

  function moveStroke(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!drawing.current || tool === 'fill') return
    paint(event)
  }

  function endStroke(event: ReactPointerEvent<HTMLCanvasElement>): void {
    drawing.current = false
    lastPixel.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function undo(): void {
    const previous = history[history.length - 1]
    const ctx = context()
    if (!previous || !ctx) return
    ctx.putImageData(previous, 0, 0)
    setHistory((current) => current.slice(0, -1))
    setDirty(true)
  }

  function clearCanvas(): void {
    const ctx = context()
    if (!ctx) return
    snapshot()
    ctx.clearRect(0, 0, width, height)
    setDirty(true)
  }

  function importPng(file: File | undefined): void {
    if (!file) return
    if (!/^image\/png$/i.test(file.type)) {
      pushToast({ title: 'Choose a PNG image', variant: 'error' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const ctx = context()
        if (!ctx) return
        snapshot()
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(image, 0, 0, width, height)
        setDirty(true)
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  function exportPng(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = kind === 'skin' ? 'triad-skin.png' : 'triad-cape.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  async function save(): Promise<void> {
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true)
    try {
      const next = await api.skins.save(kind, canvas.toDataURL('image/png'))
      setAssets(next)
      setDirty(false)
      pushToast({
        title: kind === 'skin' ? 'Skin saved' : 'Cape saved',
        description: 'Stored locally in your Triad profile.',
        variant: 'success'
      })
    } catch (error) {
      pushToast({ title: 'Could not save texture', description: errorMessage(error), variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} className="skin-studio-modal" label={t('skin.title')}>
      <ModalHeader
        title={t('skin.title')}
        subtitle={t('skin.subtitle')}
        onClose={() => setOpen(false)}
        icon={<Brush size={18} />}
      />
      <div className="skin-studio-body">
        <div className="skin-studio-main">
          <div className="skin-studio-top">
            <Segmented<Kind>
              value={kind}
              onChange={(next) => setKind(next)}
              options={[
                { value: 'skin', label: `${t('skin.skin')} 64×64` },
                { value: 'cape', label: `${t('skin.cape')} 64×32` }
              ]}
            />
            <div className="skin-tools">
              <button
                type="button"
                className={cn('icon-btn', tool === 'brush' && 'active')}
                title={t('skin.brush')}
                onClick={() => setTool('brush')}
              >
                <Brush size={16} />
              </button>
              <button
                type="button"
                className={cn('icon-btn', tool === 'eraser' && 'active')}
                title={t('skin.eraser')}
                onClick={() => setTool('eraser')}
              >
                <Eraser size={16} />
              </button>
              <button
                type="button"
                className={cn('icon-btn', tool === 'fill' && 'active')}
                title={t('skin.fill')}
                onClick={() => setTool('fill')}
              >
                <PaintBucket size={16} />
              </button>
              <button
                type="button"
                className={cn('icon-btn', showGrid && 'active')}
                title="Toggle pixel grid"
                onClick={() => setShowGrid(!showGrid)}
              >
                <Grid3X3 size={16} />
              </button>
            </div>
          </div>

          <div className="skin-canvas-shell">
            <div className="skin-canvas-label">
              <span>{kind === 'skin' ? 'SKIN TEXTURE' : 'CAPE TEXTURE'}</span>
              <span>{dirty ? 'Unsaved changes' : 'Ready'}</span>
            </div>
            <div className={cn('skin-canvas-wrap', showGrid && 'show-grid')}>
              <canvas
                ref={canvasRef}
                width={width}
                height={height}
                className="skin-canvas"
                onPointerDown={beginStroke}
                onPointerMove={moveStroke}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
                aria-label={t('skin.title')}
              />
            </div>
            <div className="skin-canvas-foot">
              <span>Pixel {brushSize}px · {color}</span>
              <span>Draw on the texture, then save</span>
            </div>
          </div>
        </div>

        <aside className="skin-studio-side">
          <div className="skin-panel">
            <span className="skin-panel-label">Palette</span>
            <div className="skin-palette">
              {COLORS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={cn('skin-swatch', color === entry && 'active')}
                  style={{ background: entry }}
                  aria-label={`Color ${entry}`}
                  onClick={() => {
                    setColor(entry)
                    if (tool === 'eraser') setTool('brush')
                  }}
                />
              ))}
              <label className="skin-color-input" title="Custom color">
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
                +
              </label>
            </div>
          </div>

          <div className="skin-panel">
            <span className="skin-panel-label">Brush size</span>
            <div className="skin-size-row">
              {SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={cn('skin-size', brushSize === size && 'active')}
                  onClick={() => setBrushSize(size)}
                >
                  {size}px
                </button>
              ))}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={!history.length}
                onClick={undo}
              >
                <Undo2 size={13} /> {t('skin.undo')}
              </button>
            </div>
          </div>

          <div className="skin-panel">
            <span className="skin-panel-label">Texture</span>
            <div className="skin-asset-actions">
              <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()}>
                <Upload size={13} /> Load PNG
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={clearCanvas}>
                <Trash2 size={13} /> {t('skin.clear')}
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/png"
              hidden
              onChange={(event) => importPng(event.currentTarget.files?.[0])}
            />
          </div>

          <div className="skin-note">
            Local texture only. Official Minecraft skins and capes are managed by your Microsoft
            account on minecraft.net.
          </div>

          <div className="skin-save-row">
            <button type="button" className="btn skin-save" onClick={exportPng}>
              <Download size={14} /> Export PNG
            </button>
            <button
              type="button"
              className="btn btn-primary skin-save"
              disabled={saving || loading || !dirty}
              onClick={() => void save()}
            >
              {saving ? <Spinner size={14} /> : <Save size={14} />}
              {saving ? 'Saving…' : t('skin.save')}
            </button>
          </div>
        </aside>
      </div>
    </Modal>
  )
}

function hexToRgba(hex: string): [number, number, number, number] {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255
  ]
}
