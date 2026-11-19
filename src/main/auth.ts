import { createHash } from 'node:crypto'
import { explainAuthError, type AuthGuidance } from '@shared/authErrors'
import type { Account, DeviceCodeInfo } from '@shared/types'
import { events } from './events'
import { fetchJson, sleep } from './util'

const LIVE = 'https://login.live.com'
const CONSUMERS = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const LIVE_SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL'
const V2_SCOPE = 'XboxLive.signin offline_access'

interface AuthEndpoints {
  deviceCode: string
  token: string
  scope: string
  rpsPrefix: 't' | 'd'
  deviceParams: Record<string, string>
}

/**
 * Mojang's public launcher client is a legacy Live Connect app (16 hex chars).
 * Custom Azure app registrations use the v2.0 consumer endpoints instead.
 */
function authEndpoints(clientId: string): AuthEndpoints {
  if (/^[0-9a-f]{16}$/i.test(clientId.trim())) {
    return {
      deviceCode: `${LIVE}/oauth20_connect.srf`,
      token: `${LIVE}/oauth20_token.srf`,
      scope: LIVE_SCOPE,
      rpsPrefix: 't',
      deviceParams: { response_type: 'device_code' }
    }
  }
  return {
    deviceCode: `${CONSUMERS}/devicecode`,
    token: `${CONSUMERS}/token`,
    scope: V2_SCOPE,
    rpsPrefix: 'd',
    deviceParams: {}
  }
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
  user_code?: string
  device_code?: string
  verification_uri?: string
  interval?: number
}

let activeController: AbortController | null = null

export function cancelLogin(): void {
  activeController?.abort()
  activeController = null
}

export function offlineUuid(name: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function validateOfflineName(name: string): string {
  const trimmed = name.trim()
  if (!/^[A-Za-z0-9_]{3,16}$/.test(trimmed)) {
    throw new Error('Username must be 3–16 characters using letters, numbers or underscores.')
  }
  return trimmed
}

async function requestDeviceCode(clientId: string): Promise<{
  info: DeviceCodeInfo
  deviceCode: string
}> {
  const endpoints = authEndpoints(clientId)
  const body = new URLSearchParams({
    client_id: clientId,
    scope: endpoints.scope,
    ...endpoints.deviceParams
  })
  const data = await fetchJson<TokenResponse>(endpoints.deviceCode, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!data.device_code || !data.user_code || !data.verification_uri) {
    throw new Error(data.error_description || 'Microsoft did not return a device code.')
  }
  return {
    deviceCode: data.device_code,
    info: {
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in ?? 900,
      interval: data.interval ?? 5
    }
  }
}

async function pollDeviceCode(deviceCode: string, clientId: string, signal: AbortSignal): Promise<TokenResponse> {
  const endpoints = authEndpoints(clientId)
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: clientId,
    device_code: deviceCode
  })
  let delay = 5000
  const deadline = Date.now() + 15 * 60_000
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('Sign-in cancelled.')
    await sleep(delay, signal)
    const res = await fetch(endpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Triad/1.0.0' },
      body: body.toString(),
      signal
    })
    const data = (await res.json()) as TokenResponse
    if (res.ok && data.access_token) return data
    switch (data.error) {
      case 'authorization_pending':
        break
      case 'slow_down':
        delay += 5000
        break
      case 'authorization_declined':
        throw new Error('Sign-in was declined in the browser.')
      case 'expired_token':
      case 'bad_verification_code':
        throw new Error('The sign-in code expired. Please try again.')
      default:
        throw new Error(data.error_description || data.error || 'Microsoft sign-in failed.')
    }
  }
  throw new Error('The sign-in code expired. Please try again.')
}

interface XboxResponse {
  Token: string
  DisplayClaims: { xui: { uhs: string }[] }
}

export async function refreshMicrosoftToken(refreshToken: string, clientId: string): Promise<TokenResponse> {
  const endpoints = authEndpoints(clientId)
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    scope: endpoints.scope
  })
  const res = await fetch(endpoints.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Triad/1.0.0' },
    body: body.toString()
  })
  const data = (await res.json()) as TokenResponse
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        'Your Microsoft session expired. Please sign in again.'
    )
  }
  return data
}

async function acquireMinecraftAccount(
  msAccessToken: string,
  clientId: string,
  refreshToken?: string
): Promise<Account> {
  const xbl = await fetchJson<XboxResponse>('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `${authEndpoints(clientId).rpsPrefix}=${msAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  })

  let xsts: XboxResponse
  try {
    xsts = await fetchJson<XboxResponse>('https://xsts.auth.xboxlive.com/xsts/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('2148916233')) {
      throw new Error('This Microsoft account has no Xbox profile yet. Create one at xbox.com, then retry.')
    }
    if (message.includes('2148916235')) {
      throw new Error('Xbox Live is not available in this account\'s region.')
    }
    if (message.includes('2148916236') || message.includes('2148916237')) {
      throw new Error('Xbox requires adult verification in your region. Verify at xbox.com, then retry.')
    }
    if (message.includes('2148916238')) {
      throw new Error('This account is managed by a family group and needs an adult to sign in first.')
    }
    throw error
  }

  const login = await fetchJson<{ access_token: string; expires_in: number }>(
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identityToken: `XBL3.0 x=${xsts.DisplayClaims.xui[0].uhs};${xsts.Token}` })
    }
  )

  const profile = await fetchJson<{ id: string; name: string }>(
    'https://api.minecraftservices.com/minecraft/profile',
    {
      headers: { Authorization: `Bearer ${login.access_token}`, Accept: 'application/json' }
    }
  )
  if (!profile?.id) {
    throw new Error('This Microsoft account does not own Minecraft: Java Edition.')
  }

  return {
    type: 'microsoft',
    name: profile.name,
    uuid: profile.id,
    accessToken: login.access_token,
    refreshToken,
    expiresAt: Date.now() + (login.expires_in ?? 86_400) * 1000
  }
}

export async function startMicrosoftLogin(
  clientId: string,
  onComplete: (account: Account) => void,
  onError: (error: Error, guidance?: AuthGuidance) => void
): Promise<DeviceCodeInfo> {
  cancelLogin()
  const controller = new AbortController()
  activeController = controller
  const { info, deviceCode } = await requestDeviceCode(clientId)
  events.authDevice(info)
  events.authState({ status: 'waiting', message: 'Waiting for Microsoft sign-in…' })

  void (async () => {
    try {
      const token = await pollDeviceCode(deviceCode, clientId, controller.signal)
      events.authState({ status: 'working', message: 'Linking Xbox Live and Minecraft…' })
      const account = await acquireMinecraftAccount(token.access_token!, clientId, token.refresh_token)
      if (controller.signal.aborted) return
      events.authState({ status: 'done', message: `Signed in as ${account.name}` })
      onComplete(account)
    } catch (error) {
      if (controller.signal.aborted) {
        events.authState({ status: 'idle' })
        return
      }
      const message = error instanceof Error ? error.message : 'Microsoft sign-in failed.'
      const guidance = explainAuthError(message)
      events.authState({ status: 'error', error: guidance.title, guidance })
      onError(new Error(guidance.title), guidance)
    } finally {
      if (activeController === controller) activeController = null
    }
  })()

  return info
}

export async function ensureFreshAccount(
  account: Account,
  clientId: string,
  force = false
): Promise<Account> {
  if (account.type !== 'microsoft') return account
  if (
    !force &&
    account.accessToken &&
    account.expiresAt &&
    account.expiresAt - 120_000 > Date.now()
  ) {
    return account
  }
  if (!account.refreshToken) {
    throw new Error('Your Microsoft session expired. Please sign in again.')
  }
  const token = await refreshMicrosoftToken(account.refreshToken, clientId)
  const refreshed = await acquireMinecraftAccount(
    token.access_token!,
    clientId,
    token.refresh_token ?? account.refreshToken
  )
  return { ...refreshed, skinUpdatedAt: account.skinUpdatedAt }
}
