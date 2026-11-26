// Shared between the main process and the hosting UI so the address field
// validates the same way everywhere. A custom address is a display address:
// it still has to resolve to this PC through DNS and port forwarding.
export const SERVER_TLDS = new Set([
  'com',
  'net',
  'org',
  'io',
  'gg',
  'dev',
  'app',
  'co',
  'me',
  'xyz',
  'play',
  'fun',
  'online',
  'site',
  'world',
  'club',
  'live',
  'cloud',
  'games',
  'game',
  'server',
  'host',
  'tech',
  'store',
  'shop',
  'pro',
  'info',
  'biz',
  'name',
  'space',
  'zone',
  'network',
  'digital',
  'us',
  'uk',
  'nl',
  'de',
  'fr',
  'es',
  'pt',
  'ca',
  'au',
  'nz',
  'jp',
  'br',
  'eu',
  'tv',
  'cc',
  'in',
  'it',
  'se',
  'no',
  'fi',
  'dk',
  'pl',
  'mx',
  'za',
  'ie',
  'ch',
  'at',
  'be',
  'cz',
  'gr',
  'tr',
  'il',
  'sg',
  'hk',
  'tw',
  'id',
  'my',
  'ph',
  'th',
  'vn',
  'ar',
  'cl',
  'pe'
])

export interface ServerAddressResult {
  address?: string
  error?: string
}

export interface ParsedServerAddress {
  host: string
  port?: number
}

/** Splits a validated address into its host and optional port. */
export function parseServerAddress(address: string): ParsedServerAddress | null {
  const value = String(address ?? '').trim()
  if (!value) return null
  const match = value.match(/^(.*):(\d{1,5})$/)
  if (match) {
    return { host: match[1].toLowerCase(), port: Number(match[2]) }
  }
  return { host: value.toLowerCase() }
}

/** The address players should type, including the server port when it is not 25565. */
export function serverJoinAddress(address: string, port: number): string {
  const parsed = parseServerAddress(address)
  if (!parsed) return `localhost:${port}`
  const joinPort = parsed.port ?? (port === 25565 ? undefined : port)
  return `${parsed.host}${joinPort ? `:${joinPort}` : ''}`
}

function validatePort(raw: string): string | null {
  if (!/^\d{1,5}$/.test(raw)) return 'The port at the end of the address must be a number.'
  const port = Number(raw)
  if (port < 1 || port > 65535) return 'Use a port between 1 and 65535.'
  return null
}

export function isIpv4(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

export function isLoopbackHost(host: string): boolean {
  return host.toLowerCase() === 'localhost' || host === '127.0.0.1'
}

export function normalizeServerAddress(raw: string): ServerAddressResult {
  const value = String(raw ?? '')
    .trim()
    .replace(/^minecraft:\/\//i, '')
    .replace(/\/+$/, '')
  if (!value) return { address: undefined }
  if (value.length > 260) return { error: 'That address is too long.' }
  if (/[\s/\\]/.test(value)) return { error: 'Addresses cannot contain spaces, slashes or backslashes.' }

  let host = value
  let port: string | undefined
  const portMatch = value.match(/^(.*):(\d{1,5})$/)
  if (portMatch) {
    host = portMatch[1]
    port = portMatch[2]
    const portError = validatePort(port)
    if (portError) return { error: portError }
  }

  if (!host) return { error: 'Enter a domain like play.example.net, or an IP address.' }
  if (host.includes(':')) {
    return { error: 'Use an IPv4 address or a domain name, for example play.example.net.' }
  }

  if (isIpv4(host) || host.toLowerCase() === 'localhost') {
    return { address: `${host.toLowerCase()}${port ? `:${port}` : ''}` }
  }

  const normalized = host.toLowerCase()
  const labels = normalized.split('.')
  if (labels.length < 2) {
    return { error: 'Use a full domain, for example play.example.net.' }
  }
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    return { error: 'The domain has a part that is not valid. Use letters, numbers and hyphens.' }
  }
  const tld = labels[labels.length - 1]
  if (!SERVER_TLDS.has(tld)) {
    return {
      error: `“.${tld}” is not a supported ending. Use a real domain ending such as .net, .com, .org, .gg or .io.`
    }
  }
  return { address: `${normalized}${port ? `:${port}` : ''}` }
}
