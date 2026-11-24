import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DEFAULT_POTATO_LEVEL, potatoPreset } from '@shared/potato'

/**
 * Merges the max-FPS preset into an instance's options.txt without dropping
 * the player's other video, audio or control settings. Runs before every
 * launch while the Potato graphics toggle is on. The slider level decides how
 * aggressive the preset is.
 *
 * The list mixes the classic keys with the Quality & Performance keys added in
 * Minecraft 1.21.11 (graphicsPreset, cutoutLeaves, textureFiltering, ...).
 * Unrecognised keys are ignored by older versions, so one list covers both.
 */
export async function applyPotatoGraphics(
  gameDir: string,
  level: number = DEFAULT_POTATO_LEVEL
): Promise<void> {
  const file = join(gameDir, 'options.txt')
  let existing = ''
  try {
    existing = await readFile(file, 'utf8')
  } catch {
    // First launch: Minecraft has not written its options yet.
  }

  const preset = potatoPreset(level)
  const options: [key: string, value: string][] = [
    ['graphicsPreset', '"custom"'],
    ['graphicsMode', '0'],
    ['fancyGraphics', 'false'],
    ['cutoutLeaves', 'false'],
    ['improvedTransparency', 'false'],
    ['textureFiltering', '0'],
    ['renderClouds', 'false'],
    ['clouds', 'false'],
    ['cloudRange', '2'],
    ['weatherRadius', '5'],
    ['chunkSectionFadeInTime', '0'],
    ['prioritizeChunkUpdates', '0'],
    ['vignette', 'false'],
    ['renderDistance', String(preset.renderDistance)],
    ['simulationDistance', String(preset.simulationDistance)],
    ['entityDistanceScaling', preset.entityDistanceScaling.toFixed(2)],
    ['particles', String(preset.particles)],
    ['ao', 'false'],
    ['entityShadows', 'false'],
    ['maxFps', String(preset.maxFps)],
    ['enableVsync', 'false'],
    ['biomeBlendRadius', String(preset.biomeBlendRadius)],
    ['mipmapLevels', String(preset.mipmapLevels)]
  ]

  const lines = existing.split(/\r?\n/).filter((line) => line.length > 0)
  const positions = new Map<string, number>()
  lines.forEach((line, index) => {
    const separator = line.indexOf(':')
    if (separator > 0) positions.set(line.slice(0, separator), index)
  })

  for (const [key, value] of options) {
    const index = positions.get(key)
    if (index === undefined) {
      positions.set(key, lines.length)
      lines.push(`${key}:${value}`)
    } else {
      lines[index] = `${key}:${value}`
    }
  }

  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${lines.join('\n')}\n`, 'utf8')
}
