export function compact(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}K`
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  return `${(value / 1_000_000_000).toFixed(1)}B`
}

export function relativeTime(timestamp?: number): string {
  if (!timestamp) return 'never'
  const diff = Date.now() - timestamp
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function shortDate(value?: string | number): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function playtime(ms: number): string {
  if (!ms || ms < 60_000) return '0m'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

export function bytes(value: number): string {
  if (!value || value < 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(0)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

export function percent(value?: number | null): string {
  if (value === null || value === undefined) return ''
  return `${Math.round(value * 100)}%`
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}

export function loaderLabel(loader: string): string {
  switch (loader) {
    case 'fabric':
      return 'Fabric'
    case 'quilt':
      return 'Quilt'
    case 'forge':
      return 'Forge'
    case 'neoforge':
      return 'NeoForge'
    default:
      return 'Vanilla'
  }
}

export function formatAuthors(hit: { author?: string }): string {
  return hit.author?.trim() || 'a creator'
}

const TAG_COLORS = [
  '#8f7bff',
  '#4ea1ff',
  '#45e6a8',
  '#ff8a5c',
  '#ff9ec9',
  '#f5c451',
  '#b6ff3d',
  '#c084fc',
  '#2dd4bf',
  '#fb7185'
]

export function tagColor(tag: string): string {
  let hash = 0
  for (let index = 0; index < tag.length; index++) {
    hash = (hash * 31 + tag.charCodeAt(index)) >>> 0
  }
  return TAG_COLORS[hash % TAG_COLORS.length]
}

export function instanceStorageLabel(instance: { group?: string; tags?: string[] }): string {
  return instance.group || instance.tags?.[0] || ''
}
