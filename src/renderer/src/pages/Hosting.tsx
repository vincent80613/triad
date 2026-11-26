import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronRight,
  Command,
  Copy,
  ExternalLink,
  FolderOpen,
  Globe2,
  Play,
  Plus,
  Save,
  Search,
  Send,
  Server,
  Settings,
  Square,
  Terminal,
  Trash2,
  Upload,
  Users,
  Wifi
} from 'lucide-react'
import { normalizeServerAddress } from '@shared/serverAddress'
import type {
  HostedServer,
  HostedServerJoinInfo,
  HostedServerState,
  HostedServerStatus,
  PublicAccessStatus,
  IslandTheme,
  McVersion,
  ServerBackup,
  ServerSoftware,
  WorldPreset
} from '@shared/types'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { cn } from '../lib/format'
import { Glass } from '../components/Glass'
import { Chip, Field, Segmented, Select, Spinner, Toggle } from '../components/Controls'
import {
  COMMAND_CATEGORIES,
  COMMAND_LIBRARY,
  GAMERULES,
  GIVE_ITEMS,
  type CommandCategory
} from '../lib/serverTools'

const MAX_LOG_LINES = 700

const STATUS_LABEL: Record<HostedServerStatus, string> = {
  stopped: 'Stopped',
  installing: 'Installing',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  error: 'Needs attention'
}

const STATUS_TONE: Record<
  HostedServerStatus,
  'muted' | 'accent' | 'ok' | 'warn' | 'danger'
> = {
  stopped: 'muted',
  installing: 'accent',
  starting: 'accent',
  running: 'ok',
  stopping: 'warn',
  error: 'danger'
}

const WORLD_PRESETS: { value: WorldPreset; label: string }[] = [
  { value: 'default', label: 'Default terrain' },
  { value: 'flat', label: 'Flat world' },
  { value: 'large_biomes', label: 'Large biomes' },
  { value: 'amplified', label: 'Amplified terrain' },
  { value: 'island', label: 'Starter island (void + island)' },
  { value: 'sky_island', label: 'Sky island (high in the air)' }
]

const ISLAND_THEMES: { value: IslandTheme; label: string }[] = [
  { value: 'grass', label: 'Grass island' },
  { value: 'desert', label: 'Desert island' },
  { value: 'snow', label: 'Snow island' },
  { value: 'nether', label: 'Nether island' }
]

const PLAYER_MODES = ['survival', 'creative', 'adventure', 'spectator']
const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard']

type HostingTab = 'console' | 'settings' | 'world' | 'commands' | 'tools'

interface CreateDraft {
  name: string
  address: string
  mcVersion: string
  software: ServerSoftware
  port: string
  memoryMb: string
  worldPreset: WorldPreset
  islandTheme: IslandTheme
  seed: string
}

interface ServerDraft {
  name: string
  address: string
  port: string
  memoryMb: string
  motd: string
  difficulty: string
  gamemode: string
  maxPlayers: string
  viewDistance: string
  simulationDistance: string
  spawnProtection: string
  idleTimeout: string
  onlineMode: boolean
  pvp: boolean
  whitelist: boolean
  allowFlight: boolean
  commandBlocks: boolean
  hardcore: boolean
  forceGamemode: boolean
  opPermissionLevel: string
  functionPermissionLevel: string
  worldPreset: WorldPreset
  islandTheme: IslandTheme
  levelName: string
  levelSeed: string
  allowNether: boolean
  generateStructures: boolean
  spawnMonsters: boolean
  spawnAnimals: boolean
  spawnNpcs: boolean
  maxWorldSize: string
  enableStatus: boolean
  hideOnlinePlayers: boolean
  maxTickTime: string
  compressionThreshold: string
  syncChunkWrites: boolean
  preventProxy: boolean
  rateLimit: string
  pauseWhenEmpty: string
  entityBroadcastRange: string
  enableQuery: boolean
  queryPort: string
  enableRcon: boolean
  rconPort: string
  rconPassword: string
  broadcastConsoleToOps: boolean
  broadcastRconToOps: boolean
  logIps: boolean
  resourcePack: string
  resourcePackPrompt: string
  resourcePackRequired: boolean
  autoSaveMinutes: string
  gamerules: Record<string, string>
}

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback
}

function clamped(value: string, min: number, max: number, fallback: number): string {
  return String(Math.min(max, Math.max(min, toNumber(value, fallback))))
}

function safeWorldName(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/^\.+$/, '')
    .trim()
    .slice(0, 64)
  return cleaned || 'world'
}

function serverDraft(server: HostedServer): ServerDraft {
  const properties = server.properties ?? {}
  const flag = (key: string, fallback: string): boolean =>
    (properties[key] ?? fallback) === 'true'
  return {
    name: server.name,
    address: server.address ?? '',
    port: String(server.port),
    memoryMb: String(server.memoryMb),
    motd: properties.motd ?? `${server.name} — hosted with Triad`,
    difficulty: properties.difficulty ?? 'easy',
    gamemode: properties.gamemode ?? 'survival',
    maxPlayers: properties['max-players'] ?? '20',
    viewDistance: properties['view-distance'] ?? '10',
    simulationDistance: properties['simulation-distance'] ?? '10',
    spawnProtection: properties['spawn-protection'] ?? '16',
    idleTimeout: properties['player-idle-timeout'] ?? '0',
    onlineMode: flag('online-mode', 'true'),
    pvp: flag('pvp', 'true'),
    whitelist: flag('white-list', 'false'),
    allowFlight: flag('allow-flight', 'false'),
    commandBlocks: flag('enable-command-block', 'false'),
    hardcore: flag('hardcore', 'false'),
    forceGamemode: flag('force-gamemode', 'false'),
    opPermissionLevel: properties['op-permission-level'] ?? '4',
    functionPermissionLevel: properties['function-permission-level'] ?? '2',
    worldPreset: server.worldPreset ?? 'default',
    islandTheme: server.islandTheme ?? 'grass',
    levelName: properties['level-name'] ?? 'world',
    levelSeed: properties['level-seed'] ?? '',
    allowNether: flag('allow-nether', 'true'),
    generateStructures: flag('generate-structures', 'true'),
    spawnMonsters: flag('spawn-monsters', 'true'),
    spawnAnimals: flag('spawn-animals', 'true'),
    spawnNpcs: flag('spawn-npcs', 'true'),
    maxWorldSize: properties['max-world-size'] ?? '29999984',
    enableStatus: flag('enable-status', 'true'),
    hideOnlinePlayers: flag('hide-online-players', 'false'),
    maxTickTime: properties['max-tick-time'] ?? '60000',
    compressionThreshold: properties['network-compression-threshold'] ?? '256',
    syncChunkWrites: flag('sync-chunk-writes', 'true'),
    preventProxy: flag('prevent-proxy-connections', 'false'),
    rateLimit: properties['rate-limit'] ?? '0',
    pauseWhenEmpty: properties['pause-when-empty-seconds'] ?? '0',
    entityBroadcastRange: properties['entity-broadcast-range-percentage'] ?? '100',
    enableQuery: flag('enable-query', 'false'),
    queryPort: properties['query.port'] ?? '25565',
    enableRcon: flag('enable-rcon', 'false'),
    rconPort: properties['rcon.port'] ?? '25575',
    rconPassword: properties['rcon.password'] ?? '',
    broadcastConsoleToOps: flag('broadcast-console-to-ops', 'true'),
    broadcastRconToOps: flag('broadcast-rcon-to-ops', 'true'),
    logIps: flag('log-ips', 'true'),
    resourcePack: properties['resource-pack'] ?? '',
    resourcePackPrompt: properties['resource-pack-prompt'] ?? '',
    resourcePackRequired: flag('resource-pack-required', 'false'),
    autoSaveMinutes: String(server.autoSaveMinutes ?? 0),
    gamerules: { ...(server.gamerules ?? {}) }
  }
}

function serverProperties(draft: ServerDraft): Record<string, string> {
  const bool = (value: boolean): string => (value ? 'true' : 'false')
  return {
    motd: draft.motd.slice(0, 120),
    difficulty: draft.difficulty,
    gamemode: draft.gamemode,
    'max-players': clamped(draft.maxPlayers, 1, 200, 20),
    'view-distance': clamped(draft.viewDistance, 2, 32, 10),
    'simulation-distance': clamped(draft.simulationDistance, 2, 32, 10),
    'spawn-protection': clamped(draft.spawnProtection, 0, 256, 16),
    'player-idle-timeout': clamped(draft.idleTimeout, 0, 1440, 0),
    'online-mode': bool(draft.onlineMode),
    pvp: bool(draft.pvp),
    'white-list': bool(draft.whitelist),
    'enforce-whitelist': bool(draft.whitelist),
    'allow-flight': bool(draft.allowFlight),
    'enable-command-block': bool(draft.commandBlocks),
    hardcore: bool(draft.hardcore),
    'force-gamemode': bool(draft.forceGamemode),
    'op-permission-level': clamped(draft.opPermissionLevel, 1, 4, 4),
    'function-permission-level': clamped(draft.functionPermissionLevel, 1, 4, 2),
    'level-name': safeWorldName(draft.levelName),
    'level-seed': draft.levelSeed.replace(/[\r\n]/g, '').slice(0, 64),
    'allow-nether': bool(draft.allowNether),
    'generate-structures': bool(draft.generateStructures),
    'spawn-monsters': bool(draft.spawnMonsters),
    'spawn-animals': bool(draft.spawnAnimals),
    'spawn-npcs': bool(draft.spawnNpcs),
    'max-world-size': clamped(draft.maxWorldSize, 1, 29999984, 29999984),
    'enable-status': bool(draft.enableStatus),
    'hide-online-players': bool(draft.hideOnlinePlayers),
    'max-tick-time': clamped(draft.maxTickTime, -1, 600000, 60000),
    'network-compression-threshold': clamped(draft.compressionThreshold, -1, 65536, 256),
    'sync-chunk-writes': bool(draft.syncChunkWrites),
    'prevent-proxy-connections': bool(draft.preventProxy),
    'rate-limit': clamped(draft.rateLimit, 0, 10000, 0),
    'pause-when-empty-seconds': clamped(draft.pauseWhenEmpty, 0, 86400, 0),
    'entity-broadcast-range-percentage': clamped(draft.entityBroadcastRange, 10, 1000, 100),
    'enable-query': bool(draft.enableQuery),
    'query.port': clamped(draft.queryPort, 1024, 65535, 25565),
    'enable-rcon': bool(draft.enableRcon),
    'rcon.port': clamped(draft.rconPort, 1024, 65535, 25575),
    'rcon.password': draft.rconPassword.replace(/[\r\n]/g, '').slice(0, 100),
    'broadcast-console-to-ops': bool(draft.broadcastConsoleToOps),
    'broadcast-rcon-to-ops': bool(draft.broadcastRconToOps),
    'log-ips': bool(draft.logIps),
    'resource-pack': draft.resourcePack.replace(/[\r\n]/g, '').slice(0, 500),
    'resource-pack-prompt': draft.resourcePackPrompt.replace(/[\r\n]/g, '').slice(0, 200),
    'resource-pack-required': bool(draft.resourcePackRequired)
  }
}

function softwareLabel(server: HostedServer): string {
  if (server.imported) {
    return server.software === 'fabric' ? 'Imported · Fabric' : 'Imported server'
  }
  return server.software === 'fabric' ? 'Fabric' : 'Vanilla'
}

export function Hosting() {
  const pushToast = useApp((state) => state.pushToast)
  const [servers, setServers] = useState<HostedServer[]>([])
  const [states, setStates] = useState<Record<string, HostedServerState>>({})
  const [joinInfo, setJoinInfo] = useState<HostedServerJoinInfo | null>(null)
  const [publicAccess, setPublicAccess] = useState<PublicAccessStatus | null>(null)
  const [publicBusy, setPublicBusy] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [tab, setTab] = useState<HostingTab>('console')
  const [logs, setLogs] = useState<string[]>([])
  const [versions, setVersions] = useState<McVersion[]>([])

  const [createDraft, setCreateDraft] = useState<CreateDraft>({
    name: '',
    address: '',
    mcVersion: '',
    software: 'vanilla',
    port: '25565',
    memoryMb: '2048',
    worldPreset: 'default',
    islandTheme: 'grass',
    seed: ''
  })
  const [acceptedEula, setAcceptedEula] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)

  const [draft, setDraft] = useState<ServerDraft | null>(null)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [addressError, setAddressError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copiedKey, setCopiedKey] = useState('')

  const [consoleInput, setConsoleInput] = useState('')
  const [commandDraft, setCommandDraft] = useState({ label: '', command: '' })
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryCategory, setLibraryCategory] = useState<'All' | CommandCategory>('All')
  const [giveDraft, setGiveDraft] = useState({
    player: '',
    item: 'diamond',
    count: '16'
  })

  const [backups, setBackups] = useState<ServerBackup[]>([])
  const [backupBusy, setBackupBusy] = useState(false)

  const selectedRef = useRef('')
  const consoleRef = useRef<HTMLDivElement>(null)
  const consoleInputRef = useRef<HTMLInputElement>(null)
  const draftServerRef = useRef('')

  const selected = useMemo(
    () => servers.find((entry) => entry.id === selectedId) ?? null,
    [selectedId, servers]
  )
  const serverState = selected ? states[selected.id] : undefined
  const status = serverState?.status ?? 'stopped'
  const transitioning =
    status === 'installing' || status === 'starting' || status === 'stopping'
  const canCommand = status === 'running' || status === 'starting'
  const address = joinInfo?.local ?? (selected ? `localhost:${selected.port}` : '')
  const publicState = publicAccess?.state ?? 'idle'
  const createAddress = normalizeServerAddress(createDraft.address)
  const releaseVersions = useMemo(() => {
    const releases = versions.filter((version) => version.type === 'release')
    return releases.length ? releases : versions
  }, [versions])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [list, stateMap] = await Promise.all([api.hosting.list(), api.hosting.states()])
        if (cancelled) return
        setServers(list)
        setStates(stateMap)
        if (list.length) setSelectedId((current) => current || list[0].id)
        else setCreating(true)
      } catch (error) {
        pushToast({
          title: 'Could not load your servers',
          description: errorMessage(error),
          variant: 'error'
        })
      }
    })()
    void api.versions
      .list()
      .then(setVersions)
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [pushToast])

  useEffect(() => {
    const unsubscribeState = api.on.hostState((next) => {
      setStates((current) => ({ ...current, [next.id]: next }))
      if (next.status === 'running' || next.status === 'stopped' || next.status === 'error') {
        void api.hosting.list().then(setServers).catch(() => undefined)
        if (next.id === selectedRef.current) {
          void api.hosting.joinInfo(next.id).then(setJoinInfo).catch(() => undefined)
          void api.hosting.publicAccess(next.id).then(setPublicAccess).catch(() => undefined)
        }
      }
    })
    const unsubscribeLog = api.on.hostLog(({ id, line }) => {
      if (id !== selectedRef.current) return
      setLogs((current) => [...current.slice(-(MAX_LOG_LINES - 1)), line])
    })
    return () => {
      unsubscribeState()
      unsubscribeLog()
    }
  }, [])

  useEffect(() => {
    selectedRef.current = selectedId
    setTab('console')
    setConfirmDelete(false)
    setAddressError('')
    setCopiedKey('')
    setJoinInfo(null)
    setPublicAccess(null)
    if (!selectedId) {
      setLogs([])
      return
    }
    let cancelled = false
    void api.hosting
      .joinInfo(selectedId)
      .then((info) => {
        if (!cancelled) setJoinInfo(info)
      })
      .catch(() => {
        if (!cancelled) setJoinInfo(null)
      })
    void api.hosting
      .publicAccess(selectedId)
      .then((status) => {
        if (!cancelled) setPublicAccess(status)
      })
      .catch(() => {
        if (!cancelled) setPublicAccess(null)
      })
    void api.hosting
      .logs(selectedId)
      .then((lines) => {
        if (!cancelled) setLogs(lines.slice(-MAX_LOG_LINES))
      })
      .catch(() => undefined)
    void api.hosting.states().then((map) => {
      if (!cancelled) setStates(map)
    })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(() => {
    if (!selectedId || !publicAccess) return
    if (publicAccess.state === 'idle' && !publicAccess.address) return
    if (publicAccess.state === 'error') return
    const timer = window.setInterval(() => {
      void api.hosting.publicAccess(selectedId).then(setPublicAccess).catch(() => undefined)
    }, 2500)
    return () => window.clearInterval(timer)
  }, [selectedId, publicAccess?.state])

  useEffect(() => {
    if (!selected) {
      setDraft(null)
      draftServerRef.current = ''
      return
    }
    if (draftServerRef.current !== selected.id) {
      draftServerRef.current = selected.id
      setDraft(serverDraft(selected))
    }
  }, [selected])

  useEffect(() => {
    if (createDraft.mcVersion || !releaseVersions.length) return
    setCreateDraft((current) => ({ ...current, mcVersion: releaseVersions[0].id }))
  }, [createDraft.mcVersion, releaseVersions])

  useEffect(() => {
    const node = consoleRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [logs])

  useEffect(() => {
    if (!selected || tab !== 'tools') return
    void loadBackups(selected.id)
  }, [selected?.id, tab])

  async function loadBackups(id: string): Promise<void> {
    setBackups(await api.hosting.backups(id).catch(() => []))
  }

  function patchDraft(patch: Partial<ServerDraft>): void {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  function patchGamerule(key: string, value: string): void {
    setDraft((current) =>
      current ? { ...current, gamerules: { ...current.gamerules, [key]: value } } : current
    )
  }

  function gameruleValue(key: string, fallback: string): string {
    return draft?.gamerules[key] ?? fallback
  }

  async function startServer(id: string): Promise<void> {
    try {
      await api.hosting.start(id)
    } catch (error) {
      pushToast({ title: 'Could not start the server', description: errorMessage(error), variant: 'error' })
    }
  }

  async function stopServer(id: string): Promise<void> {
    try {
      await api.hosting.stop(id)
    } catch (error) {
      pushToast({ title: 'Could not stop the server', description: errorMessage(error), variant: 'error' })
    }
  }

  async function createServer(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!acceptedEula) return
    if (createAddress.error) {
      pushToast({ title: 'That server address is not valid', description: createAddress.error, variant: 'error' })
      return
    }
    setCreateBusy(true)
    try {
      const created = await api.hosting.create({
        name: createDraft.name,
        address: createDraft.address,
        mcVersion: createDraft.mcVersion,
        software: createDraft.software,
        port: toNumber(createDraft.port, 25565),
        memoryMb: toNumber(createDraft.memoryMb, 2048),
        worldPreset: createDraft.worldPreset,
        islandTheme: createDraft.islandTheme,
        levelSeed: createDraft.seed
      })
      setServers((current) =>
        current.some((entry) => entry.id === created.id)
          ? current.map((entry) => (entry.id === created.id ? created : entry))
          : [...current, created]
      )
      setStates((current) => ({
        ...current,
        [created.id]: { id: created.id, status: 'stopped', players: 0, message: 'Ready to install and start.' }
      }))
      setSelectedId(created.id)
      setCreating(false)
      setAcceptedEula(false)
      setCreateDraft((current) => ({
        ...current,
        name: '',
        address: '',
        seed: '',
        port: '25565',
        memoryMb: '2048',
        worldPreset: 'default',
        islandTheme: 'grass'
      }))
      pushToast({
        title: `${created.name} is ready`,
        description:
          created.worldPreset === 'island' || created.worldPreset === 'sky_island'
            ? 'Hit Start to download the server and build your spawn island.'
            : 'Hit Start to download the server and create the world.',
        variant: 'success'
      })
    } catch (error) {
      pushToast({ title: 'Could not create the server', description: errorMessage(error), variant: 'error' })
    } finally {
      setCreateBusy(false)
    }
  }

  async function importServer(): Promise<void> {
    setImporting(true)
    try {
      const imported = await api.hosting.import()
      if (!imported) return
      setServers((current) =>
        current.some((entry) => entry.id === imported.id)
          ? current.map((entry) => (entry.id === imported.id ? imported : entry))
          : [...current, imported]
      )
      setStates((current) => ({
        ...current,
        [imported.id]: {
          id: imported.id,
          status: 'stopped',
          players: 0,
          message: 'Imported and ready to start.'
        }
      }))
      setSelectedId(imported.id)
      setCreating(false)
      pushToast({
        title: `${imported.name} imported`,
        description: `Minecraft ${imported.mcVersion} · ${imported.jarFile ?? 'server.jar'} was copied into Triad. The original folder is untouched.`,
        variant: 'success'
      })
    } catch (error) {
      pushToast({ title: 'Could not import that server', description: errorMessage(error), variant: 'error' })
    } finally {
      setImporting(false)
    }
  }

  async function saveSettings(event?: FormEvent): Promise<void> {
    event?.preventDefault()
    if (!selected || !draft) return
    const check = normalizeServerAddress(draft.address)
    if (check.error) {
      setAddressError(check.error)
      setTab('settings')
      return
    }
    if (draft.enableRcon && !draft.rconPassword.trim()) {
      pushToast({
        title: 'Set an RCON password',
        description: 'RCON needs a password before the server can start.',
        variant: 'error'
      })
      setTab('tools')
      return
    }
    setSettingsBusy(true)
    try {
      const keepImportedWorld =
        !!selected.imported &&
        draft.worldPreset === (selected.worldPreset ?? 'default') &&
        draft.islandTheme === (selected.islandTheme ?? 'grass')
      const updated = await api.hosting.update(selected.id, {
        name: draft.name,
        address: draft.address,
        port: toNumber(draft.port, selected.port),
        memoryMb: toNumber(draft.memoryMb, selected.memoryMb),
        properties: serverProperties(draft),
        gamerules: draft.gamerules,
        autoSaveMinutes: toNumber(draft.autoSaveMinutes, 0),
        ...(keepImportedWorld
          ? {}
          : { worldPreset: draft.worldPreset, islandTheme: draft.islandTheme })
      })
      setServers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
      setDraft(serverDraft(updated))
      void api.hosting.joinInfo(updated.id).then(setJoinInfo).catch(() => undefined)
      setAddressError('')
      pushToast({
        title: 'Server settings saved',
        description: transitioning
          ? 'Restart the server to apply the changes.'
          : 'They apply the next time you start the server. World rules apply immediately while it runs.',
        variant: 'success'
      })
    } catch (error) {
      pushToast({ title: 'Could not save the settings', description: errorMessage(error), variant: 'error' })
    } finally {
      setSettingsBusy(false)
    }
  }

  async function removeServer(id: string): Promise<void> {
    setConfirmDelete(false)
    try {
      await api.hosting.remove(id)
      const remaining = servers.filter((entry) => entry.id !== id)
      setServers(remaining)
      const nextServer = remaining[0]
      setSelectedId(nextServer?.id ?? '')
      setDraft(nextServer ? serverDraft(nextServer) : null)
      draftServerRef.current = nextServer?.id ?? ''
      setTab('console')
      setStates((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      setCreating(remaining.length === 0)
      pushToast({
        title: 'Server deleted',
        description: 'Its Triad copy, world and backups were removed.'
      })
    } catch (error) {
      pushToast({ title: 'Could not delete the server', description: errorMessage(error), variant: 'error' })
    }
  }

  async function sendConsoleCommand(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!selected || !consoleInput.trim()) return
    const command = consoleInput.trim()
    setConsoleInput('')
    try {
      await api.hosting.command(selected.id, command)
    } catch (error) {
      pushToast({ title: 'Command not sent', description: errorMessage(error), variant: 'error' })
    }
  }

  async function runCommand(command: string): Promise<void> {
    if (!selected) return
    try {
      await api.hosting.command(selected.id, command)
    } catch (error) {
      pushToast({ title: 'Command not sent', description: errorMessage(error), variant: 'error' })
    }
  }

  function insertCommand(command: string): void {
    setConsoleInput(command)
    setTab('console')
    window.setTimeout(() => consoleInputRef.current?.focus(), 80)
  }

  async function addCommand(label: string, command: string): Promise<boolean> {
    if (!selected) return false
    try {
      const updated = await api.hosting.addCommand(selected.id, label, command)
      setServers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
      return true
    } catch (error) {
      pushToast({ title: 'Could not save the command', description: errorMessage(error), variant: 'error' })
      return false
    }
  }

  async function addCommandFromForm(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!commandDraft.label.trim() || !commandDraft.command.trim()) return
    const saved = await addCommand(commandDraft.label, commandDraft.command)
    if (saved) setCommandDraft({ label: '', command: '' })
  }

  async function removeCommand(commandId: string): Promise<void> {
    if (!selected) return
    try {
      const updated = await api.hosting.removeCommand(selected.id, commandId)
      setServers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))
    } catch (error) {
      pushToast({ title: 'Could not remove the command', description: errorMessage(error), variant: 'error' })
    }
  }

  async function copyValue(value: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      window.setTimeout(
        () => setCopiedKey((current) => (current === key ? '' : current)),
        1800
      )
      pushToast({ title: 'Address copied', description: value })
    } catch {
      pushToast({ title: 'Could not copy the address', description: value, variant: 'error' })
    }
  }

  async function copyAddress(): Promise<void> {
    if (!address) return
    await copyValue(address, 'local')
  }

  async function enablePublicAccess(): Promise<void> {
    if (!selected || publicBusy) return
    const serverId = selected.id
    setPublicBusy(true)
    try {
      const status = await api.hosting.publicAccessEnable(serverId)
      if (selectedRef.current === serverId) setPublicAccess(status)
    } catch (error) {
      pushToast({
        title: 'Could not turn on public access',
        description: errorMessage(error),
        variant: 'error'
      })
    } finally {
      setPublicBusy(false)
    }
  }

  async function disablePublicAccess(): Promise<void> {
    if (!selected || publicBusy) return
    const serverId = selected.id
    setPublicBusy(true)
    try {
      const status = await api.hosting.publicAccessDisable(serverId)
      if (selectedRef.current === serverId) setPublicAccess(status)
      pushToast({
        title: 'Public access is off',
        description: 'Players outside your network can no longer join this server.'
      })
    } catch (error) {
      pushToast({
        title: 'Could not turn off public access',
        description: errorMessage(error),
        variant: 'error'
      })
    } finally {
      setPublicBusy(false)
    }
  }

  function openPublicPage(): void {
    const url = publicAccess?.claimUrl ?? publicAccess?.helpUrl
    if (url) void api.app.openExternal(url)
  }

  async function createBackup(): Promise<void> {
    if (!selected) return
    setBackupBusy(true)
    try {
      const created = await api.hosting.backup(selected.id)
      setBackups((current) => [created, ...current])
      pushToast({
        title: 'World backup created',
        description: created.name,
        variant: 'success'
      })
    } catch (error) {
      pushToast({ title: 'Could not create a backup', description: errorMessage(error), variant: 'error' })
    } finally {
      setBackupBusy(false)
    }
  }

  const filteredLibrary = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase()
    return COMMAND_LIBRARY.filter((entry) => {
      if (libraryCategory !== 'All' && entry.category !== libraryCategory) return false
      if (!query) return true
      return (
        entry.command.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query) ||
        entry.category.toLowerCase().includes(query)
      )
    })
  }, [libraryCategory, libraryQuery])

  const givePlayer = giveDraft.player.trim()
  const giveValid = /^[A-Za-z0-9_]{1,16}$/.test(givePlayer)
  const giveCommand = `give ${givePlayer || '<player>'} minecraft:${giveDraft.item} ${clamped(
    giveDraft.count,
    1,
    64,
    1
  )}`
  const giveItemLabel = GIVE_ITEMS.find((entry) => entry.id === giveDraft.item)?.label ?? giveDraft.item

  return (
    <div className="page hosting-page">
      <div className="page-header">
        <div className="page-heading">
          <div className="eyebrow">
            <Server size={11} /> Hosting
          </div>
          <h1 className="page-title">Your own Minecraft server</h1>
          <p className="page-sub">
            Run a server on this PC, import one you already have, shape the world, and control
            everything from one console.
          </p>
        </div>
        <div className="page-actions">
          <span className="hosting-local-note">
            <Wifi size={12} /> Runs on this PC
          </span>
          <button
            type="button"
            className="btn"
            disabled={importing}
            onClick={() => void importServer()}
            title="Copy an existing server folder into Triad and host it here. Stop it in its old launcher first so the world copies cleanly."
          >
            {importing ? <Spinner size={14} /> : <Upload size={14} />}
            {importing ? 'Importing…' : 'Import server'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setCreating(true)
              setAcceptedEula(false)
            }}
          >
            <Plus size={14} /> New server
          </button>
        </div>
      </div>

      <div className="hosting-layout">
        <Glass className="hosting-list" flat>
          <div className="hosting-list-head">
            <span>Servers</span>
            <span>{servers.length}</span>
          </div>
          {servers.length === 0 ? (
            <p className="hosting-list-empty">No servers yet.</p>
          ) : (
            <div className="hosting-list-scroll">
              {servers.map((entry) => {
                const entryState = states[entry.id]
                const entryStatus = entryState?.status ?? 'stopped'
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={cn('hosting-card', entry.id === selectedId && !creating && 'active')}
                    onClick={() => {
                      if (entry.id !== selectedId) {
                        setDraft(serverDraft(entry))
                        draftServerRef.current = entry.id
                        setTab('console')
                        setConfirmDelete(false)
                      }
                      setSelectedId(entry.id)
                      setCreating(false)
                    }}
                  >
                    <span className={cn('hosting-status-dot', entryStatus)} aria-hidden />
                    <span className="hosting-card-copy">
                      <strong>{entry.name}</strong>
                      <span>
                        MC {entry.mcVersion} · {softwareLabel(entry)}
                      </span>
                      <span className="hosting-card-meta">
                        Port {entry.port}
                        {entryStatus === 'running' ? ` · ${entryState?.players ?? 0} online` : ''}
                      </span>
                    </span>
                    <ChevronRight size={14} className="hosting-card-arrow" />
                  </button>
                )
              })}
            </div>
          )}
        </Glass>

        <div className="hosting-main">
          {creating ? (
            <Glass strong className="hosting-create">
              <div className="hosting-detail-head">
                <div className="hosting-detail-icon">
                  <Server size={19} />
                </div>
                <div className="hosting-detail-title">
                  <h2>New server</h2>
                  <p>
                    Pick a version and a world style. Triad downloads the official server jar on
                    the first start and builds your spawn if you choose an island.
                  </p>
                </div>
              </div>

              <form className="hosting-form" onSubmit={(event) => void createServer(event)}>
                <div className="hosting-create-grid">
                  <Field label="Server name">
                    <input
                      className="input"
                      value={createDraft.name}
                      placeholder="Friends smp"
                      maxLength={48}
                      onChange={(event) =>
                        setCreateDraft((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Minecraft version" hint="Release versions only.">
                    <Select
                      value={createDraft.mcVersion}
                      ariaLabel="Minecraft version"
                      onChange={(value) =>
                        setCreateDraft((current) => ({ ...current, mcVersion: value }))
                      }
                    >
                      {releaseVersions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.id}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Software" hint="Fabric supports server-side mods.">
                    <Segmented<ServerSoftware>
                      value={createDraft.software}
                      onChange={(value) =>
                        setCreateDraft((current) => ({ ...current, software: value }))
                      }
                      options={[
                        { value: 'vanilla', label: 'Vanilla' },
                        { value: 'fabric', label: 'Fabric' }
                      ]}
                    />
                  </Field>
                  <Field
                    label="Custom address"
                    hint={
                      (createDraft.address ? createAddress.error : '') ||
                      'Optional, and only useful if you own the domain and its DNS already points at this network. Otherwise leave it empty and use the localhost or Wi-Fi address Triad shows.'
                    }
                  >
                    <input
                      className={cn('input', createDraft.address && createAddress.error && 'input--invalid')}
                      value={createDraft.address}
                      placeholder="play.example.net"
                      maxLength={260}
                      onChange={(event) =>
                        setCreateDraft((current) => ({ ...current, address: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Port" hint="Friends join using your PC’s local IP and this port.">
                    <input
                      className="input"
                      type="number"
                      min={1024}
                      max={65535}
                      value={createDraft.port}
                      onChange={(event) =>
                        setCreateDraft((current) => ({ ...current, port: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Memory (MB)" hint="Megabytes dedicated to the server.">
                    <input
                      className="input"
                      type="number"
                      min={1024}
                      max={32768}
                      step={512}
                      value={createDraft.memoryMb}
                      onChange={(event) =>
                        setCreateDraft((current) => ({ ...current, memoryMb: event.target.value }))
                      }
                    />
                  </Field>
                  <Field
                    label="World preset"
                    hint="Existing worlds keep their terrain; this is for a brand-new world."
                  >
                    <Select
                      value={createDraft.worldPreset}
                      ariaLabel="World preset"
                      onChange={(value) =>
                        setCreateDraft((current) => ({
                          ...current,
                          worldPreset: value as WorldPreset
                        }))
                      }
                    >
                      {WORLD_PRESETS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Spawn island theme"
                    hint="Used by the starter island and sky island presets."
                  >
                    <Select
                      value={createDraft.islandTheme}
                      disabled={
                        createDraft.worldPreset !== 'island' &&
                        createDraft.worldPreset !== 'sky_island'
                      }
                      ariaLabel="Spawn island theme"
                      onChange={(value) =>
                        setCreateDraft((current) => ({
                          ...current,
                          islandTheme: value as IslandTheme
                        }))
                      }
                    >
                      {ISLAND_THEMES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="World seed" hint="Leave blank for a random seed.">
                    <input
                      className="input"
                      value={createDraft.seed}
                      placeholder="Random"
                      maxLength={64}
                      onChange={(event) =>
                        setCreateDraft((current) => ({ ...current, seed: event.target.value }))
                      }
                    />
                  </Field>
                </div>

                <label className="hosting-eula">
                  <input
                    type="checkbox"
                    checked={acceptedEula}
                    onChange={(event) => setAcceptedEula(event.target.checked)}
                  />
                  <span>
                    I accept the{' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        void api.app.openExternal('https://www.minecraft.net/en-us/eula')
                      }
                    >
                      Minecraft EULA
                    </button>{' '}
                    and understand this server runs while Triad is open.
                  </span>
                </label>

                <div className="hosting-form-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setCreating(false)
                      setAcceptedEula(false)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={
                      createBusy ||
                      !acceptedEula ||
                      !createDraft.name.trim() ||
                      !createDraft.mcVersion ||
                      (!!createDraft.address && !!createAddress.error)
                    }
                  >
                    {createBusy ? <Spinner size={14} /> : <Plus size={14} />}
                    {createBusy ? 'Creating…' : 'Create server'}
                  </button>
                </div>
              </form>
            </Glass>
          ) : selected ? (
            <Glass strong className="hosting-detail">
              <div className="hosting-detail-head">
                <div className="hosting-detail-icon">
                  <Server size={19} />
                </div>
                <div className="hosting-detail-title">
                  <div className="hosting-title-line">
                    <h2>{selected.name}</h2>
                    <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>
                    {selected.imported && <Chip tone="muted">Imported</Chip>}
                  </div>
                  <p>
                    Minecraft {selected.mcVersion} · {softwareLabel(selected)} · {address} ·{' '}
                    {selected.memoryMb} MB
                  </p>
                </div>
                <div className="hosting-detail-actions">
                  {status === 'running' || status === 'starting' || status === 'stopping' ? (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={status === 'stopping' || status === 'starting'}
                      onClick={() => void stopServer(selected.id)}
                    >
                      <Square size={12} /> Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={transitioning}
                      onClick={() => void startServer(selected.id)}
                    >
                      <Play size={13} /> {status === 'error' ? 'Retry' : 'Start'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={cn('icon-btn', copiedKey === 'local' && 'hosting-copy-done')}
                    title="Copy the address for this PC"
                    aria-label="Copy the address for this PC"
                    onClick={() => void copyAddress()}
                  >
                    {copiedKey === 'local' ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Open server folder"
                    aria-label="Open server folder"
                    onClick={() => void api.hosting.openFolder(selected.id)}
                  >
                    <FolderOpen size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Delete server"
                    aria-label="Delete server"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {confirmDelete && (
                <div className="hosting-confirm">
                  <div>
                    <strong>Delete {selected.name}?</strong>
                    <span>
                      This removes the Triad copy, its world and backups.
                      {selected.imported ? ' The original imported folder is untouched.' : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => void removeServer(selected.id)}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}

              {(serverState?.message || status === 'error') && (
                <div className={cn('hosting-state-bar', status)}>
                  {transitioning ? (
                    <Spinner size={13} />
                  ) : status === 'error' ? (
                    <AlertTriangle size={13} />
                  ) : (
                    <span className={cn('hosting-state-dot', status)} />
                  )}
                                      <span>{serverState?.message ?? 'Something needs your attention.'}</span>
                  {status === 'running' && (
                    <span className="hosting-players">
                      <Users size={12} /> {serverState?.players ?? 0} online
                    </span>
                  )}
                </div>
              )}

              <div className="hosting-join">
                <div className="hosting-join-head">
                  <Wifi size={13} />
                  <strong>How to join</strong>
                  <span>
                    {status === 'running'
                      ? 'Server is online on this PC'
                      : 'These addresses work once the server is running'}
                  </span>
                </div>
                <div className="hosting-join-rows">
                  <div className="hosting-join-row">
                    <span className="hosting-join-label">This PC</span>
                    <code className="hosting-join-address">{address}</code>
                    <span className="hosting-join-hint">
                      Type this into Minecraft on this computer
                    </span>
                    <button
                      type="button"
                      className="icon-btn icon-btn--xs"
                      title="Copy this address"
                      onClick={() => void copyValue(address, 'local')}
                    >
                      {copiedKey === 'local' ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                  {joinInfo?.lan.map((lanAddress) => (
                    <div className="hosting-join-row" key={lanAddress}>
                      <span className="hosting-join-label">Same Wi-Fi</span>
                      <code className="hosting-join-address">{lanAddress}</code>
                      <span className="hosting-join-hint">Friends on your network</span>
                      <button
                        type="button"
                        className="icon-btn icon-btn--xs"
                        title="Copy this address"
                        onClick={() => void copyValue(lanAddress, lanAddress)}
                      >
                        {copiedKey === lanAddress ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                  ))}
                  {joinInfo?.custom &&
                    joinInfo.custom.address !== address &&
                    !joinInfo.lan.includes(joinInfo.custom.address) && (
                      <div
                        className={cn(
                          'hosting-join-row',
                          !joinInfo.custom.resolves && 'is-warning'
                        )}
                      >
                        <span className="hosting-join-label">Custom</span>
                        <code className="hosting-join-address">{joinInfo.custom.address}</code>
                        <span className="hosting-join-hint">
                          {joinInfo.custom.resolves
                            ? `DNS points to ${joinInfo.custom.addresses[0] ?? 'this address'}`
                            : 'Doesn’t resolve yet'}
                        </span>
                        <button
                          type="button"
                          className="icon-btn icon-btn--xs"
                          title="Copy this address"
                          onClick={() => void copyValue(joinInfo.custom!.address, 'custom')}
                        >
                          {copiedKey === 'custom' ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                      </div>
                    )}
                </div>
                {joinInfo?.custom && !joinInfo.custom.resolves && (
                  <p className="hosting-join-warning">
                    <AlertTriangle size={12} />
                    <span>
                      <code>{joinInfo.custom.address}</code> doesn’t resolve in DNS yet, so Minecraft
                      says “Unknown host”. Point the domain at this network, or use the public
                      option below.
                    </span>
                  </p>
                )}

                <div className={cn('hosting-public', publicState === 'online' && 'is-online')}>
                  <div className="hosting-public-head">
                    <Globe2 size={12} />
                    <strong>Friends anywhere</strong>
                    <span className="hosting-public-provider">playit.gg</span>
                  </div>

                  {publicState === 'idle' && (
                    <div className="hosting-public-body">
                      <p>
                        {publicAccess?.address ? (
                          <>
                            Your saved address is <code>{publicAccess.address}</code>. Turn it back
                            on when you are ready.
                          </>
                        ) : (
                          'Get a public address that works without opening ports on your router. The playit.gg setup is free and only takes a minute.'
                        )}
                      </p>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={publicBusy}
                        onClick={() => void enablePublicAccess()}
                      >
                        {publicBusy ? <Spinner size={13} /> : <Globe2 size={13} />}
                        {publicAccess?.address ? 'Turn on' : 'Set up public access'}
                      </button>
                    </div>
                  )}

                  {publicState === 'awaiting-claim' && (
                    <div className="hosting-public-body">
                      <p>
                        Finish the one-time setup in your browser. This panel updates on its own.
                      </p>
                      <div className="hosting-public-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={!publicAccess?.claimUrl}
                          onClick={openPublicPage}
                        >
                          <ExternalLink size={13} /> Open setup page
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={publicBusy}
                          onClick={() => void disablePublicAccess()}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {publicState === 'starting' && (
                    <div className="hosting-public-body">
                      <p className="hosting-public-status">
                        <Spinner size={13} />
                        {publicAccess?.detail ?? 'Creating your public address…'}
                      </p>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={publicBusy}
                        onClick={() => void disablePublicAccess()}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {publicState === 'online' && publicAccess?.address && (
                    <div className="hosting-public-body">
                      <div className="hosting-public-address">
                        <code>{publicAccess.address}</code>
                        <button
                          type="button"
                          className="icon-btn icon-btn--xs"
                          title="Copy the public address"
                          onClick={() => void copyValue(publicAccess.address!, 'public')}
                        >
                          {copiedKey === 'public' ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                      </div>
                      <div className="hosting-public-actions">
                        <span className="hosting-public-hint">
                          {status === 'running'
                            ? 'Send this to friends anywhere. They can add it in Minecraft.'
                            : 'Start the server, then send this address to friends.'}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={publicBusy}
                          onClick={() => void disablePublicAccess()}
                        >
                          Turn off
                        </button>
                      </div>
                    </div>
                  )}

                  {publicState === 'error' && (
                    <div className="hosting-public-body">
                      <p className="hosting-public-error">
                        <AlertTriangle size={12} />
                        <span>{publicAccess?.error ?? 'Something went wrong.'}</span>
                      </p>
                      <div className="hosting-public-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={publicBusy}
                          onClick={() => void enablePublicAccess()}
                        >
                          {publicBusy ? <Spinner size={13} /> : <Globe2 size={13} />}
                          Try again
                        </button>
                        {publicAccess?.helpUrl && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={openPublicPage}
                          >
                            <ExternalLink size={13} /> Open playit
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="hosting-tabs">
                <Segmented<HostingTab>
                  value={tab}
                  onChange={setTab}
                  options={[
                    {
                      value: 'console',
                      label: (
                        <span className="hosting-tab-label">
                          <Terminal size={13} /> Console
                        </span>
                      )
                    },
                    {
                      value: 'settings',
                      label: (
                        <span className="hosting-tab-label">
                          <Settings size={13} /> Settings
                        </span>
                      )
                    },
                    {
                      value: 'world',
                      label: (
                        <span className="hosting-tab-label">
                          <Globe2 size={13} /> World
                        </span>
                      )
                    },
                    {
                      value: 'commands',
                      label: (
                        <span className="hosting-tab-label">
                          <Command size={13} /> Commands
                        </span>
                      )
                    },
                    {
                      value: 'tools',
                      label: (
                        <span className="hosting-tab-label">
                          <Archive size={13} /> Tools
                        </span>
                      )
                    }
                  ]}
                />
              </div>

              {tab === 'console' && (
                <div className="host-console">
                  <div className="host-console-bar">
                    <span className={cn('hosting-live', status)} />
                    <span>{status === 'running' ? 'Live console' : 'Console'}</span>
                    <span className="host-console-hint">
                      {address} · {logs.length ? `${logs.length} lines` : 'Output appears here'}
                    </span>
                  </div>
                  <div className="host-console-body" ref={consoleRef} aria-live="polite">
                    {logs.length === 0 ? (
                      <div className="host-console-empty">
                        <Terminal size={20} />
                        <p>
                          {status === 'stopped'
                            ? 'Start the server to see its console here.'
                            : 'Waiting for output…'}
                        </p>
                        <span>
                          The first start downloads the server jar and creates the world. It can
                          take a few minutes.
                        </span>
                      </div>
                    ) : (
                      logs.map((line, index) => (
                        <div
                          key={`${index}-${line.slice(0, 24)}`}
                          className={cn(
                            'host-console-line',
                            line.startsWith('> ') && 'is-command',
                            /\b(ERROR|SEVERE|Exception)\b/.test(line) && 'is-error'
                          )}
                        >
                          {line}
                        </div>
                      ))
                    )}
                  </div>
                  <form className="host-console-form" onSubmit={(event) => void sendConsoleCommand(event)}>
                    <span className="host-console-prompt">&gt;</span>
                    <input
                      ref={consoleInputRef}
                      className="input"
                      value={consoleInput}
                      placeholder={
                        canCommand
                          ? 'Type a server command, e.g. list, op YourName, time set day'
                          : 'Start the server to send commands'
                      }
                      disabled={!canCommand}
                      onChange={(event) => setConsoleInput(event.target.value)}
                    />
                    <button
                      type="submit"
                      className="btn btn-sm btn-primary"
                      disabled={!canCommand || !consoleInput.trim()}
                      aria-label="Send command"
                    >
                      <Send size={13} />
                    </button>
                  </form>
                </div>
              )}

              {tab === 'settings' && draft && (
                <form className="hosting-form" onSubmit={(event) => void saveSettings(event)}>
                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>Identity and address</h3>
                      <span>Port and memory apply after a restart.</span>
                    </div>
                    <div className="hosting-create-grid">
                      <Field label="Name">
                        <input
                          className="input"
                          value={draft.name}
                          maxLength={48}
                          onChange={(event) => patchDraft({ name: event.target.value })}
                        />
                      </Field>
                      <Field
                        label="Custom address"
                        hint={
                          addressError ||
                          'Optional. Must end in a real TLD like .net, .com or .org, and its DNS record must already point at this network. Until then Minecraft says “Unknown host”; use the addresses above the tabs.'
                        }
                      >
                        <input
                          className={cn('input', addressError && 'input--invalid')}
                          value={draft.address}
                          placeholder="play.example.net"
                          maxLength={260}
                          onChange={(event) => {
                            patchDraft({ address: event.target.value })
                            if (addressError) setAddressError('')
                          }}
                        />
                      </Field>
                      <Field label="Port">
                        <input
                          className="input"
                          type="number"
                          min={1024}
                          max={65535}
                          value={draft.port}
                          onChange={(event) => patchDraft({ port: event.target.value })}
                        />
                      </Field>
                      <Field label="Memory (MB)">
                        <input
                          className="input"
                          type="number"
                          min={1024}
                          max={32768}
                          step={512}
                          value={draft.memoryMb}
                          onChange={(event) => patchDraft({ memoryMb: event.target.value })}
                        />
                      </Field>
                      <Field label="MOTD" hint="Shown in the multiplayer server list.">
                        <input
                          className="input"
                          value={draft.motd}
                          maxLength={120}
                          onChange={(event) => patchDraft({ motd: event.target.value })}
                        />
                      </Field>
                    </div>
                    <p className="hosting-subnote">
                      Players on this PC can join <code>localhost:{selected.port}</code>; friends on
                      your Wi-Fi use the address Triad shows above the tabs. A custom address only
                      works after its DNS record points at your router and port {selected.port} is
                      forwarded.
                    </p>
                    {selected.imported && selected.sourcePath && (
                      <p className="hosting-subnote">
                        Imported from <code>{selected.sourcePath}</code> using{' '}
                        <code>{selected.jarFile ?? 'server.jar'}</code>. Deleting this server
                        leaves that original folder alone.
                      </p>
                    )}
                  </section>

                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>Gameplay</h3>
                      <span>Defaults match Minecraft.</span>
                    </div>
                    <div className="hosting-create-grid">
                      <Field label="Difficulty">
                        <Select
                          value={draft.difficulty}
                          ariaLabel="Difficulty"
                          onChange={(value) => patchDraft({ difficulty: value })}
                        >
                          {DIFFICULTIES.map((value) => (
                            <option key={value} value={value}>
                              {value[0].toUpperCase() + value.slice(1)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Default gamemode">
                        <Select
                          value={draft.gamemode}
                          ariaLabel="Gamemode"
                          onChange={(value) => patchDraft({ gamemode: value })}
                        >
                          {PLAYER_MODES.map((value) => (
                            <option key={value} value={value}>
                              {value[0].toUpperCase() + value.slice(1)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Max players">
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={200}
                          value={draft.maxPlayers}
                          onChange={(event) => patchDraft({ maxPlayers: event.target.value })}
                        />
                      </Field>
                      <Field label="Spawn protection" hint="Blocks around spawn, 0–256.">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={256}
                          value={draft.spawnProtection}
                          onChange={(event) => patchDraft({ spawnProtection: event.target.value })}
                        />
                      </Field>
                      <Field label="Idle timeout" hint="Minutes before AFK players kick. 0 is off.">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={1440}
                          value={draft.idleTimeout}
                          onChange={(event) => patchDraft({ idleTimeout: event.target.value })}
                        />
                      </Field>
                      <Field label="Op permission level" hint="1–4. Four is full operator access.">
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={4}
                          value={draft.opPermissionLevel}
                          onChange={(event) =>
                            patchDraft({ opPermissionLevel: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Function permission level" hint="1–4. Permission used inside datapack functions.">
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={4}
                          value={draft.functionPermissionLevel}
                          onChange={(event) =>
                            patchDraft({ functionPermissionLevel: event.target.value })
                          }
                        />
                      </Field>
                    </div>
                  </section>

                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>Access and rules</h3>
                    </div>
                    <div className="hosting-toggles">
                      <Toggle
                        label="Online mode"
                        description="Only verified Minecraft accounts can join. Turn off for cracked clients."
                        checked={draft.onlineMode}
                        onChange={(value) => patchDraft({ onlineMode: value })}
                      />
                      <Toggle
                        label="PvP"
                        description="Allow players to damage each other."
                        checked={draft.pvp}
                        onChange={(value) => patchDraft({ pvp: value })}
                      />
                      <Toggle
                        label="Whitelist"
                        description="Only listed players can join. Add them with whitelist add Name in the console."
                        checked={draft.whitelist}
                        onChange={(value) => patchDraft({ whitelist: value })}
                      />
                      <Toggle
                        label="Allow flight"
                        description="Prevents flying players from being kicked."
                        checked={draft.allowFlight}
                        onChange={(value) => patchDraft({ allowFlight: value })}
                      />
                      <Toggle
                        label="Command blocks"
                        description="Enable command blocks in the world."
                        checked={draft.commandBlocks}
                        onChange={(value) => patchDraft({ commandBlocks: value })}
                      />
                      <Toggle
                        label="Force gamemode"
                        description="Players always join in the default gamemode."
                        checked={draft.forceGamemode}
                        onChange={(value) => patchDraft({ forceGamemode: value })}
                      />
                    </div>
                  </section>

                  <div className="hosting-form-actions">
                    <span className="field-hint">
                      Changes are written to server.properties before every start.
                    </span>
                    <button type="submit" className="btn btn-primary" disabled={settingsBusy}>
                      {settingsBusy ? <Spinner size={14} /> : <Save size={14} />}
                      {settingsBusy ? 'Saving…' : 'Save settings'}
                    </button>
                  </div>
                </form>
              )}

              {tab === 'world' && draft && (
                <form className="hosting-form" onSubmit={(event) => void saveSettings(event)}>
                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>World generation</h3>
                      <span>New worlds only — existing terrain is kept.</span>
                    </div>
                    <div className="hosting-create-grid">
                      <Field label="World preset">
                        <Select
                          value={draft.worldPreset}
                          ariaLabel="World preset"
                          onChange={(value) => patchDraft({ worldPreset: value as WorldPreset })}
                        >
                          {WORLD_PRESETS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Spawn island theme" hint="Used by island presets.">
                        <Select
                          value={draft.islandTheme}
                          disabled={
                            draft.worldPreset !== 'island' && draft.worldPreset !== 'sky_island'
                          }
                          ariaLabel="Spawn island theme"
                          onChange={(value) => patchDraft({ islandTheme: value as IslandTheme })}
                        >
                          {ISLAND_THEMES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="World name" hint="Folder name inside the server folder.">
                        <input
                          className="input"
                          value={draft.levelName}
                          maxLength={64}
                          onChange={(event) => patchDraft({ levelName: event.target.value })}
                        />
                      </Field>
                      <Field label="Seed" hint="Leave blank for random.">
                        <input
                          className="input"
                          value={draft.levelSeed}
                          placeholder="Random"
                          maxLength={64}
                          onChange={(event) => patchDraft({ levelSeed: event.target.value })}
                        />
                      </Field>
                      <Field label="View distance" hint="Chunks, 2–32.">
                        <input
                          className="input"
                          type="number"
                          min={2}
                          max={32}
                          value={draft.viewDistance}
                          onChange={(event) => patchDraft({ viewDistance: event.target.value })}
                        />
                      </Field>
                      <Field label="Simulation distance" hint="Chunks, 2–32.">
                        <input
                          className="input"
                          type="number"
                          min={2}
                          max={32}
                          value={draft.simulationDistance}
                          onChange={(event) =>
                            patchDraft({ simulationDistance: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Max world size" hint="Blocks from the centre, up to 29,999,984.">
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={29999984}
                          value={draft.maxWorldSize}
                          onChange={(event) => patchDraft({ maxWorldSize: event.target.value })}
                        />
                      </Field>
                      <Field label="Entity broadcast range" hint="Percent, 10–1000.">
                        <input
                          className="input"
                          type="number"
                          min={10}
                          max={1000}
                          value={draft.entityBroadcastRange}
                          onChange={(event) =>
                            patchDraft({ entityBroadcastRange: event.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <div className="hosting-toggles">
                      <Toggle
                        label="Allow the Nether"
                        description="Players can build and use Nether portals."
                        checked={draft.allowNether}
                        onChange={(value) => patchDraft({ allowNether: value })}
                      />
                      <Toggle
                        label="Generate structures"
                        description="Villages, temples, strongholds and other structures."
                        checked={draft.generateStructures}
                        onChange={(value) => patchDraft({ generateStructures: value })}
                      />
                      <Toggle
                        label="Spawn monsters"
                        description="Hostile mobs can spawn naturally."
                        checked={draft.spawnMonsters}
                        onChange={(value) => patchDraft({ spawnMonsters: value })}
                      />
                      <Toggle
                        label="Spawn animals"
                        description="Passive animals can spawn naturally."
                        checked={draft.spawnAnimals}
                        onChange={(value) => patchDraft({ spawnAnimals: value })}
                      />
                      <Toggle
                        label="Spawn NPCs"
                        description="Villagers and other NPCs can spawn."
                        checked={draft.spawnNpcs}
                        onChange={(value) => patchDraft({ spawnNpcs: value })}
                      />
                      <Toggle
                        label="Hardcore"
                        description="Players become spectators when they die. Cannot be undone in-game."
                        checked={draft.hardcore}
                        onChange={(value) => patchDraft({ hardcore: value })}
                      />
                    </div>
                  </section>

                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>World rules</h3>
                      <span>{GAMERULES.length} gamerules · saved rules reapply on start</span>
                    </div>
                    <div className="hosting-rules">
                      {GAMERULES.map((definition) =>
                        definition.type === 'bool' ? (
                          <Toggle
                            key={definition.key}
                            label={definition.label}
                            description={definition.description}
                            checked={gameruleValue(definition.key, definition.defaultValue) === 'true'}
                            onChange={(value) =>
                              patchGamerule(definition.key, value ? 'true' : 'false')
                            }
                          />
                        ) : (
                          <Field
                            key={definition.key}
                            label={definition.label}
                            hint={definition.description}
                          >
                            <input
                              className="input"
                              type="number"
                              min={definition.min}
                              max={definition.max}
                              value={gameruleValue(definition.key, definition.defaultValue)}
                              onChange={(event) =>
                                patchGamerule(definition.key, event.target.value)
                              }
                            />
                          </Field>
                        )
                      )}
                    </div>
                    <div className="hosting-rule-actions">
                      <span className="field-hint">
                        Toggle a rule or change a number. Reset writes every rule back to its
                        vanilla default; saving applies them live.
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          const defaults: Record<string, string> = {}
                          for (const rule of GAMERULES) defaults[rule.key] = rule.defaultValue
                          patchDraft({ gamerules: defaults })
                        }}
                      >
                        Reset to defaults
                      </button>
                    </div>
                  </section>

                  <div className="hosting-form-actions">
                    <span className="field-hint">
                      World generation settings apply to a brand-new world only.
                    </span>
                    <button type="submit" className="btn btn-primary" disabled={settingsBusy}>
                      {settingsBusy ? <Spinner size={14} /> : <Save size={14} />}
                      {settingsBusy ? 'Saving…' : 'Save world settings'}
                    </button>
                  </div>
                </form>
              )}

              {tab === 'commands' && (
                <div className="hosting-commands">
                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>Saved commands</h3>
                      <span>One click sends the command to the console.</span>
                    </div>
                    {(selected.commands ?? []).length === 0 ? (
                      <p className="hosting-hint">
                        No saved commands yet. Add your own below, or save one from the library.
                      </p>
                    ) : (
                      <div className="hosting-command-list">
                        {(selected.commands ?? []).map((entry) => (
                          <div key={entry.id} className="hosting-command">
                            <div className="hosting-command-copy">
                              <strong>{entry.label}</strong>
                              <code>{entry.command}</code>
                            </div>
                            <button
                              type="button"
                              className="btn btn-sm btn-accent-soft"
                              disabled={!canCommand}
                              onClick={() => void runCommand(entry.command)}
                            >
                              <Play size={12} /> Run
                            </button>
                            <button
                              type="button"
                              className="icon-btn icon-btn--xs"
                              title="Remove command"
                              aria-label={`Remove ${entry.label}`}
                              onClick={() => void removeCommand(entry.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <form className="hosting-command-add" onSubmit={(event) => void addCommandFromForm(event)}>
                      <Field label="Label">
                        <input
                          className="input"
                          value={commandDraft.label}
                          placeholder="Daytime"
                          maxLength={40}
                          onChange={(event) =>
                            setCommandDraft((current) => ({ ...current, label: event.target.value }))
                          }
                        />
                      </Field>
                      <Field label="Command" hint="Without the leading slash.">
                        <input
                          className="input"
                          value={commandDraft.command}
                          placeholder="time set day"
                          maxLength={200}
                          onChange={(event) =>
                            setCommandDraft((current) => ({ ...current, command: event.target.value }))
                          }
                        />
                      </Field>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={!commandDraft.label.trim() || !commandDraft.command.trim()}
                      >
                        <Plus size={13} /> Add command
                      </button>
                    </form>
                  </section>

                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>Command library</h3>
                      <span>{COMMAND_LIBRARY.length} commands explained</span>
                    </div>
                    <div className="hosting-library-tools">
                      <div className="hosting-library-search">
                        <Search size={14} />
                        <input
                          className="input"
                          value={libraryQuery}
                          placeholder="Search commands and what they do…"
                          onChange={(event) => setLibraryQuery(event.target.value)}
                        />
                      </div>
                      <Segmented<'All' | CommandCategory>
                        value={libraryCategory}
                        onChange={setLibraryCategory}
                        options={[
                          { value: 'All', label: 'All' },
                          ...COMMAND_CATEGORIES.map((category) => ({
                            value: category,
                            label: category
                          }))
                        ]}
                      />
                    </div>
                    <div className="hosting-library">
                      {filteredLibrary.map((entry) => {
                        const needsInput = entry.command.includes('<')
                        return (
                          <div key={`${entry.category}-${entry.command}`} className="hosting-library-row">
                            <div className="hosting-library-copy">
                              <div className="hosting-library-line">
                                <Chip tone="muted">{entry.category}</Chip>
                                <code>{entry.command}</code>
                              </div>
                              <p>{entry.description}</p>
                            </div>
                            {needsInput ? (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => insertCommand(entry.command)}
                              >
                                <Terminal size={12} /> Use
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm btn-accent-soft"
                                disabled={!canCommand}
                                onClick={() => void runCommand(entry.command)}
                              >
                                <Play size={12} /> Run
                              </button>
                            )}
                            {!needsInput && (
                              <button
                                type="button"
                                className="icon-btn icon-btn--xs"
                                title="Save to my commands"
                                aria-label={`Save ${entry.description}`}
                                onClick={() =>
                                  void addCommand(entry.description.slice(0, 40), entry.command)
                                }
                              >
                                <Plus size={13} />
                              </button>
                            )}
                          </div>
                        )
                      })}
                      {filteredLibrary.length === 0 && (
                        <p className="hosting-hint">No commands match that search.</p>
                      )}
                    </div>
                  </section>

                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>Give an item</h3>
                      <span>Build a give command for any online player.</span>
                    </div>
                    <div className="hosting-give">
                      <Field label="Player" hint="Exact Minecraft name.">
                        <input
                          className="input"
                          value={giveDraft.player}
                          placeholder="Steve"
                          maxLength={16}
                          onChange={(event) =>
                            setGiveDraft((current) => ({ ...current, player: event.target.value }))
                          }
                        />
                      </Field>
                      <Field label="Item">
                        <Select
                          value={giveDraft.item}
                          ariaLabel="Item"
                          onChange={(value) =>
                            setGiveDraft((current) => ({ ...current, item: value }))
                          }
                        >
                          {GIVE_ITEMS.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Count" hint="1–64.">
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={64}
                          value={giveDraft.count}
                          onChange={(event) =>
                            setGiveDraft((current) => ({ ...current, count: event.target.value }))
                          }
                        />
                      </Field>
                      <div className="hosting-give-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={!giveValid || !canCommand}
                          onClick={() => void runCommand(giveCommand)}
                        >
                          <Send size={12} /> Give item
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={!giveValid}
                          onClick={() =>
                            void addCommand(`Give ${giveDraft.count} ${giveItemLabel}`, giveCommand)
                          }
                        >
                          <Plus size={12} /> Save command
                        </button>
                      </div>
                    </div>
                    <p className="hosting-give-preview">
                      <code>{giveCommand}</code>
                    </p>
                    <p className="hosting-subnote">
                      Use the library for enchantments and effects. A give command needs the
                      player to be online.
                    </p>
                  </section>
                </div>
              )}

              {tab === 'tools' && draft && (
                <form className="hosting-form" onSubmit={(event) => void saveSettings(event)}>
                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>Backups</h3>
                      <span>Copies the world, settings, ops and whitelist.</span>
                    </div>
                    <div className="hosting-backup-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={backupBusy || status === 'installing' || status === 'starting'}
                        onClick={() => void createBackup()}
                      >
                        {backupBusy ? <Spinner size={13} /> : <Archive size={13} />}
                        {backupBusy ? 'Backing up…' : 'Create backup'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => void api.hosting.openBackups(selected.id)}
                      >
                        <FolderOpen size={13} /> Open backups folder
                      </button>
                      <span className="field-hint">
                        {backups.length
                          ? `${backups.length} backup${backups.length === 1 ? '' : 's'}`
                          : 'No backups yet'}
                      </span>
                    </div>
                    {backups.length > 0 && (
                      <div className="hosting-backup-list">
                        {backups.slice(0, 8).map((entry) => (
                          <div key={entry.name} className="hosting-backup-row">
                            <Archive size={13} />
                            <div>
                              <strong>{new Date(entry.createdAt).toLocaleString()}</strong>
                              <code>{entry.name}</code>
                            </div>
                            <button
                              type="button"
                              className="icon-btn icon-btn--xs"
                              title="Open this backup"
                              aria-label={`Open backup ${entry.name}`}
                              onClick={() => void api.app.openPath(entry.path)}
                            >
                              <FolderOpen size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="hosting-create-grid">
                      <Field
                        label="Auto-save every"
                        hint="Minutes. 0 disables automatic save-all. Changes apply immediately."
                      >
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={720}
                          value={draft.autoSaveMinutes}
                          onChange={(event) => patchDraft({ autoSaveMinutes: event.target.value })}
                        />
                      </Field>
                    </div>
                  </section>

                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>Network and performance</h3>
                    </div>
                    <div className="hosting-create-grid">
                      <Field label="Max tick time" hint="Milliseconds before the watchdog stops a frozen server. -1 disables it.">
                        <input
                          className="input"
                          type="number"
                          min={-1}
                          max={600000}
                          value={draft.maxTickTime}
                          onChange={(event) => patchDraft({ maxTickTime: event.target.value })}
                        />
                      </Field>
                      <Field label="Compression threshold" hint="Bytes before packets compress. -1 disables compression.">
                        <input
                          className="input"
                          type="number"
                          min={-1}
                          max={65536}
                          value={draft.compressionThreshold}
                          onChange={(event) =>
                            patchDraft({ compressionThreshold: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Rate limit" hint="Packets per second per player. 0 is unlimited.">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={10000}
                          value={draft.rateLimit}
                          onChange={(event) => patchDraft({ rateLimit: event.target.value })}
                        />
                      </Field>
                      <Field label="Pause when empty" hint="Seconds before an empty server pauses. 0 is off.">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={86400}
                          value={draft.pauseWhenEmpty}
                          onChange={(event) => patchDraft({ pauseWhenEmpty: event.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="hosting-toggles">
                      <Toggle
                        label="Server status"
                        description="Show the server in the multiplayer list and status pings."
                        checked={draft.enableStatus}
                        onChange={(value) => patchDraft({ enableStatus: value })}
                      />
                      <Toggle
                        label="Hide online players"
                        description="Do not expose the player list to status pings."
                        checked={draft.hideOnlinePlayers}
                        onChange={(value) => patchDraft({ hideOnlinePlayers: value })}
                      />
                      <Toggle
                        label="Sync chunk writes"
                        description="Safer saves at a small performance cost."
                        checked={draft.syncChunkWrites}
                        onChange={(value) => patchDraft({ syncChunkWrites: value })}
                      />
                      <Toggle
                        label="Block proxy connections"
                        description="Reject connections routed through a proxy."
                        checked={draft.preventProxy}
                        onChange={(value) => patchDraft({ preventProxy: value })}
                      />
                      <Toggle
                        label="Log player IPs"
                        description="Write player IP addresses to the server log."
                        checked={draft.logIps}
                        onChange={(value) => patchDraft({ logIps: value })}
                      />
                      <Toggle
                        label="Broadcast console to ops"
                        description="Send console commands to operators in chat."
                        checked={draft.broadcastConsoleToOps}
                        onChange={(value) => patchDraft({ broadcastConsoleToOps: value })}
                      />
                      <Toggle
                        label="Broadcast RCON to ops"
                        description="Send RCON commands to operators in chat."
                        checked={draft.broadcastRconToOps}
                        onChange={(value) => patchDraft({ broadcastRconToOps: value })}
                      />
                    </div>
                  </section>

                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>Resource pack</h3>
                      <span>Optional.</span>
                    </div>
                    <div className="hosting-create-grid">
                      <Field label="Pack URL" hint="A direct https:// link to the pack zip.">
                        <input
                          className="input"
                          value={draft.resourcePack}
                          placeholder="https://example.net/pack.zip"
                          maxLength={500}
                          onChange={(event) => patchDraft({ resourcePack: event.target.value })}
                        />
                      </Field>
                      <Field label="Prompt" hint="Message players see when the pack is offered.">
                        <input
                          className="input"
                          value={draft.resourcePackPrompt}
                          maxLength={200}
                          onChange={(event) =>
                            patchDraft({ resourcePackPrompt: event.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <div className="hosting-toggles">
                      <Toggle
                        label="Required pack"
                        description="Players must accept the resource pack to join."
                        checked={draft.resourcePackRequired}
                        onChange={(value) => patchDraft({ resourcePackRequired: value })}
                      />
                    </div>
                  </section>

                  <section className="hosting-section">
                    <div className="hosting-section-head">
                      <h3>Remote access</h3>
                      <span>For external tools, not required for Triad.</span>
                    </div>
                    <div className="hosting-create-grid">
                      <Field label="Query port" hint="UDP status query port.">
                        <input
                          className="input"
                          type="number"
                          min={1024}
                          max={65535}
                          value={draft.queryPort}
                          onChange={(event) => patchDraft({ queryPort: event.target.value })}
                        />
                      </Field>
                      <Field label="RCON port" hint="Only used when RCON is enabled.">
                        <input
                          className="input"
                          type="number"
                          min={1024}
                          max={65535}
                          value={draft.rconPort}
                          onChange={(event) => patchDraft({ rconPort: event.target.value })}
                        />
                      </Field>
                      <Field label="RCON password" hint="Required when RCON is on. Keep it private.">
                        <input
                          className="input"
                          type="password"
                          value={draft.rconPassword}
                          maxLength={100}
                          onChange={(event) => patchDraft({ rconPassword: event.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="hosting-toggles">
                      <Toggle
                        label="Enable query"
                        description="Allow external tools to read server status."
                        checked={draft.enableQuery}
                        onChange={(value) => patchDraft({ enableQuery: value })}
                      />
                      <Toggle
                        label="Enable RCON"
                        description="Allow remote console access. This gives full server control."
                        checked={draft.enableRcon}
                        onChange={(value) => patchDraft({ enableRcon: value })}
                      />
                    </div>
                  </section>

                  <div className="hosting-form-actions">
                    <span className="field-hint">
                      Backups live inside the server folder and are deleted with it.
                    </span>
                    <button type="submit" className="btn btn-primary" disabled={settingsBusy}>
                      {settingsBusy ? <Spinner size={14} /> : <Save size={14} />}
                      {settingsBusy ? 'Saving…' : 'Save tools settings'}
                    </button>
                  </div>
                </form>
              )}
            </Glass>
          ) : (
            <Glass className="hosting-empty">
              <div className="empty-icon">
                <Server size={22} />
              </div>
              <h3>No server selected</h3>
              <p>
                Create a server, or import an existing server folder from your PC to keep its
                world, settings, ops and whitelist.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                <Plus size={14} /> New server
              </button>
            </Glass>
          )}
        </div>
      </div>
    </div>
  )
}
