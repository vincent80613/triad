import type { Account, SkinApplyResult, SkinVariant } from '@shared/types'
import { ensureFreshAccount } from './auth'
import { events } from './events'
import type { Store } from './store'
import { USER_AGENT } from './util'

const SKIN_ENDPOINT = 'https://api.minecraftservices.com/minecraft/profile/skins'
const MAX_SKIN_BYTES = 2 * 1024 * 1024

interface DecodedSkin {
  bytes: Buffer
  width: number
  height: number
}

function decodeSkin(dataUrl: string): DecodedSkin {
  if (typeof dataUrl !== 'string' || dataUrl.length > 3_000_000) {
    throw new Error('That skin image is too large (maximum 2 MB).')
  }
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl)
  if (!match) throw new Error('The skin must be a PNG image.')
  const bytes = Buffer.from(match[1], 'base64')
  if (bytes.length > MAX_SKIN_BYTES) {
    throw new Error('That skin image is too large (maximum 2 MB).')
  }
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('The file is not a valid PNG image.')
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width !== 64 || (height !== 64 && height !== 32)) {
    throw new Error('Minecraft skins must be a 64×64 or 64×32 PNG.')
  }
  return { bytes, width, height }
}

function profileError(status: number, payload: unknown): Error {
  const data =
    payload && typeof payload === 'object'
      ? (payload as { errorMessage?: string; error?: string; message?: string })
      : {}
  const detail = data.errorMessage || data.error || data.message

  if (status === 401) {
    return new Error('Your Microsoft session expired. Sign in again, then apply the skin.')
  }
  if (status === 403) {
    return new Error('Minecraft did not allow a skin change for this account right now.')
  }
  if (status === 429) {
    return new Error('Minecraft is rate-limiting skin changes. Wait a minute and try again.')
  }
  if (status === 400) {
    return new Error(
      detail
        ? `Minecraft rejected that skin: ${detail}`
        : 'Minecraft rejected that skin. Try a standard 64×64 or 64×32 PNG.'
    )
  }
  return new Error(
    detail
      ? `Minecraft could not apply the skin: ${detail}`
      : `Minecraft could not apply the skin (HTTP ${status}).`
  )
}

async function uploadSkin(
  account: Account,
  skin: DecodedSkin,
  variant: SkinVariant
): Promise<{ textureUrl?: string }> {
  if (!account.accessToken) {
    throw new Error('Your Microsoft session expired. Sign in again, then apply the skin.')
  }

  const form = new FormData()
  form.append('variant', variant)
  form.append('file', new Blob([skin.bytes], { type: 'image/png' }), 'skin.png')

  let response: Response
  try {
    response = await fetch(SKIN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        Accept: 'application/json',
        'User-Agent': USER_AGENT
      },
      body: form,
      signal: AbortSignal.timeout(30_000)
    })
  } catch (error) {
    if ((error as Error)?.name === 'TimeoutError') {
      throw new Error('Minecraft Services took too long to respond. Try again.')
    }
    throw new Error('Could not reach Minecraft Services. Check your connection and try again.')
  }

  const text = await response.text().catch(() => '')
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (response.status === 401) {
    throw profileError(401, payload)
  }
  if (!response.ok) {
    throw profileError(response.status, payload)
  }

  const profile =
    payload && typeof payload === 'object'
      ? (payload as {
          skins?: { state?: string; url?: string }[]
        })
      : {}
  const active =
    profile.skins?.find((entry) => entry.state === 'ACTIVE') ?? profile.skins?.[0]
  let textureUrl = active?.url
  if (textureUrl && !/^https?:\/\//i.test(textureUrl)) {
    textureUrl = `https://${textureUrl.replace(/^\/+/, '')}`
  }
  return { textureUrl }
}

export async function applyMinecraftSkin(
  store: Store,
  dataUrl: string,
  variant: SkinVariant
): Promise<SkinApplyResult> {
  if (variant !== 'classic' && variant !== 'slim') {
    throw new Error('Choose the Classic or Slim skin model.')
  }
  const account = store.data.account
  if (!account || account.type !== 'microsoft') {
    throw new Error(
      'Sign in with a Microsoft account to apply a skin in game. Offline profiles can only preview skins.'
    )
  }

  const skin = decodeSkin(dataUrl)
  let fresh = await ensureFreshAccount(account, store.settings.clientId)
  let uploaded: { textureUrl?: string }
  try {
    uploaded = await uploadSkin(fresh, skin, variant)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('session expired')) throw error
    // The token can be rejected before its recorded expiry. Refresh once, then retry.
    fresh = await ensureFreshAccount(fresh, store.settings.clientId, true)
    uploaded = await uploadSkin(fresh, skin, variant)
  }

  const appliedAt = Date.now()
  const updated: Account = { ...fresh, skinUpdatedAt: appliedAt }
  store.data.account = updated
  store.save(true)
  events.account(updated)
  events.dataChanged('account')
  events.toast({
    title: 'Skin applied',
    description: `${updated.name} has a new look. Join a world or restart Minecraft to see it.`,
    variant: 'success'
  })

  return {
    name: updated.name,
    uuid: updated.uuid,
    variant,
    appliedAt,
    textureUrl: uploaded.textureUrl
  }
}
