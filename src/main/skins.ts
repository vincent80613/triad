import { app } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SkinAssets } from '@shared/types'

function skinDir(): string {
  return join(app.getPath('userData'), 'skins')
}

function skinPath(kind: 'skin' | 'cape'): string {
  return join(skinDir(), kind === 'skin' ? 'custom-skin.png' : 'custom-cape.png')
}

async function asDataUrl(file: string): Promise<string | undefined> {
  try {
    const bytes = await readFile(file)
    return `data:image/png;base64,${bytes.toString('base64')}`
  } catch {
    return undefined
  }
}

export async function loadSkins(): Promise<SkinAssets> {
  const [skin, cape] = await Promise.all([asDataUrl(skinPath('skin')), asDataUrl(skinPath('cape'))])
  return { skin, cape }
}

export async function saveSkin(kind: 'skin' | 'cape', dataUrl: string): Promise<SkinAssets> {
  if (kind !== 'skin' && kind !== 'cape') throw new Error('Unknown skin asset.')
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) throw new Error('The skin must be a PNG image.')
  const bytes = Buffer.from(match[1], 'base64')
  if (bytes.length > 2 * 1024 * 1024) throw new Error('That image is too large (maximum 2 MB).')
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e) {
    throw new Error('The file is not a valid PNG image.')
  }
  await mkdir(skinDir(), { recursive: true })
  await writeFile(skinPath(kind), bytes)
  return loadSkins()
}

export async function clearSkin(kind: 'skin' | 'cape'): Promise<SkinAssets> {
  if (kind !== 'skin' && kind !== 'cape') throw new Error('Unknown skin asset.')
  await rm(skinPath(kind), { force: true })
  return loadSkins()
}
