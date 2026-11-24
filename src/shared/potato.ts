export const POTATO_MIN_LEVEL = 25
export const POTATO_MAX_LEVEL = 100
export const DEFAULT_POTATO_LEVEL = 100

export interface PotatoPreset {
  level: number
  renderDistance: number
  simulationDistance: number
  entityDistanceScaling: number
  particles: 0 | 1 | 2
  maxFps: number
  mipmapLevels: number
  biomeBlendRadius: number
}

export function clampPotatoLevel(value: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_POTATO_LEVEL
  return Math.min(POTATO_MAX_LEVEL, Math.max(POTATO_MIN_LEVEL, Math.round(parsed)))
}

/**
 * Scales the max-FPS preset with the Potato graphics slider. 100 is full
 * potato; lower values keep more of the game's visual quality.
 */
export function potatoPreset(levelInput: number): PotatoPreset {
  const level = clampPotatoLevel(levelInput)
  const softness = (POTATO_MAX_LEVEL - level) / (POTATO_MAX_LEVEL - POTATO_MIN_LEVEL)
  const renderDistance = Math.round(5 + softness * 7)
  return {
    level,
    renderDistance,
    // Minecraft 1.21.11 only accepts simulation distances of 5-32; an
    // out-of-range value makes the game fall back to its default (12).
    simulationDistance: Math.max(
      5,
      Math.min(renderDistance, Math.round(5 + softness * 3))
    ),
    entityDistanceScaling: Number((0.5 + softness * 0.5).toFixed(2)),
    particles: level >= 75 ? 2 : level >= 50 ? 1 : 0,
    maxFps: 260,
    mipmapLevels: Math.round(softness * 4),
    biomeBlendRadius: Math.round(softness * 3)
  }
}

export function potatoLevelLabel(levelInput: number): string {
  const level = clampPotatoLevel(levelInput)
  if (level >= 90) return 'Full potato'
  if (level >= 65) return 'Strong'
  if (level >= 45) return 'Balanced'
  return 'Light trim'
}
