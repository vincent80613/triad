import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { existsSync } from 'node:fs'
import { cp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { basename, join, resolve } from 'node:path'
import {
  isIpv4,
  isLoopbackHost,
  normalizeServerAddress,
  parseServerAddress,
  serverJoinAddress
} from '@shared/serverAddress'
import type {
  CreateHostedServerInput,
  HostedServer,
  HostedServerJoinInfo,
  HostedServerPatch,
  HostedServerState,
  IslandTheme,
  ServerBackup,
  ServerSoftware,
  WorldPreset
} from '@shared/types'
import { events } from './events'
import { ensureJava } from './java'
import type { Store } from './store'
import {
  downloadFile,
  ensureDir,
  fetchJson,
  formatBytes,
  isInside,
  readJson,
  sleep,
  uid,
  writeJson
} from './util'
import { getManifest, latestRelease } from './versions'

const MAX_LOG_LINES = 700
const STOP_TIMEOUT_MS = 20_000
const DNS_TIMEOUT_MS = 4_000
const WORLD_PRESETS: WorldPreset[] = [
  'default',
  'flat',
  'large_biomes',
  'amplified',
  'island',
  'sky_island'
]
const ISLAND_THEMES: IslandTheme[] = ['grass', 'desert', 'snow', 'nether']

interface Managed {
  process?: ChildProcessWithoutNullStreams
  state: HostedServerState
  log: string[]
  stopping: boolean
  autoSave?: NodeJS.Timeout
  rulesApplied?: boolean
  buildIsland?: boolean
  islandBuilt?: boolean
}

interface VanillaDetail {
  id?: string
  javaVersion?: { majorVersion?: number }
  downloads?: { server?: { url?: string; sha1?: string; size?: number } }
}

interface HostMarker {
  mcVersion?: string
  software?: ServerSoftware
  loaderVersion?: string
  javaMajor?: number
  builtAt?: number
}

interface FabricLoaderEntry {
  loader?: { version?: string; stable?: boolean }
}

interface FabricInstallerEntry {
  version?: string
  stable?: boolean
}

const PROPERTY_DEFAULTS: Record<string, string> = {
  difficulty: 'easy',
  gamemode: 'survival',
  'force-gamemode': 'false',
  pvp: 'true',
  'online-mode': 'true',
  'white-list': 'false',
  'enforce-whitelist': 'false',
  'max-players': '20',
  'view-distance': '10',
  'simulation-distance': '10',
  'spawn-protection': '16',
  'allow-flight': 'false',
  'enable-command-block': 'false',
  hardcore: 'false',
  'player-idle-timeout': '0',
  'level-name': 'world',
  'level-seed': '',
  'level-type': 'minecraft:normal',
  'generator-settings': '',
  'allow-nether': 'true',
  'generate-structures': 'true',
  'spawn-monsters': 'true',
  'spawn-animals': 'true',
  'spawn-npcs': 'true',
  'max-world-size': '29999984',
  'network-compression-threshold': '256',
  'max-tick-time': '60000',
  'sync-chunk-writes': 'true',
  'prevent-proxy-connections': 'false',
  'rate-limit': '0',
  'hide-online-players': 'false',
  'enable-status': 'true',
  'enable-query': 'false',
  'query.port': '25565',
  'enable-rcon': 'false',
  'rcon.port': '25575',
  'rcon.password': '',
  'broadcast-console-to-ops': 'true',
  'broadcast-rcon-to-ops': 'true',
  'log-ips': 'true',
  'pause-when-empty-seconds': '0',
  'entity-broadcast-range-percentage': '100',
  'resource-pack': '',
  'resource-pack-prompt': '',
  'resource-pack-required': 'false',
  'op-permission-level': '4',
  'function-permission-level': '2'
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function parseProperties(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('!')) continue
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    if (!key) continue
    result[key] = line.slice(index + 1).trim()
  }
  return result
}

function serializeProperties(values: Record<string, string>): string {
  const header = '#Minecraft server properties\n#Written by Triad\n'
  const body = Object.entries(values)
    .map(([key, value]) => `${key}=${String(value).replace(/[\r\n]/g, '')}`)
    .join('\n')
  return `${header}${body}\n`
}

function defaultProperties(name: string): Record<string, string> {
  return {
    motd: `${name} — hosted with Triad`,
    ...PROPERTY_DEFAULTS
  }
}

function cleanProperties(input: Record<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  if (!input || typeof input !== 'object') return result
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = String(rawKey).trim()
    if (!/^[a-z0-9._-]{1,64}$/i.test(key)) continue
    result[key] = String(rawValue ?? '').replace(/[\r\n]/g, ' ').slice(0, 400)
    if (Object.keys(result).length >= 120) break
  }
  return result
}

function cleanGamerules(input: Record<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  if (!input || typeof input !== 'object') return result
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = String(rawKey).trim()
    if (!/^[a-z][a-z0-9]{1,40}$/i.test(key)) continue
    const value = String(rawValue ?? '').trim()
    if (!/^(true|false|-?\d{1,6})$/i.test(value)) continue
    result[key] = value
    if (Object.keys(result).length >= 80) break
  }
  return result
}

function worldProperties(preset: WorldPreset): Record<string, string> {
  switch (preset) {
    case 'flat':
      return { 'level-type': 'minecraft:flat', 'generator-settings': '' }
    case 'large_biomes':
      return { 'level-type': 'minecraft:large_biomes', 'generator-settings': '' }
    case 'amplified':
      return { 'level-type': 'minecraft:amplified', 'generator-settings': '' }
    case 'island':
    case 'sky_island':
      return {
        'level-type': 'minecraft:flat',
        'generator-settings': JSON.stringify({
          layers: [{ block: 'minecraft:air', height: 1 }],
          biome: 'minecraft:plains'
        })
      }
    default:
      return { 'level-type': 'minecraft:normal', 'generator-settings': '' }
  }
}

function islandHeight(preset: WorldPreset): number {
  return preset === 'sky_island' ? 160 : 100
}

function islandCommands(theme: IslandTheme, y: number): string[] {
  const base = theme === 'desert' ? 'minecraft:sandstone' : theme === 'nether' ? 'minecraft:netherrack' : 'minecraft:stone'
  const middle =
    theme === 'desert' ? 'minecraft:sand' : theme === 'snow' ? 'minecraft:snow_block' : theme === 'nether' ? 'minecraft:blackstone' : 'minecraft:dirt'
  const top =
    theme === 'desert' ? 'minecraft:sand' : theme === 'snow' ? 'minecraft:snow_block' : theme === 'nether' ? 'minecraft:blackstone' : 'minecraft:grass_block'
  const log =
    theme === 'desert' ? 'minecraft:sandstone' : theme === 'snow' ? 'minecraft:spruce_log' : theme === 'nether' ? 'minecraft:crimson_stem' : 'minecraft:oak_log'
  const leaf =
    theme === 'snow' ? 'minecraft:spruce_leaves' : theme === 'nether' ? 'minecraft:nether_wart_block' : 'minecraft:oak_leaves'
  const commands = [
    'gamerule spawnRadius 0',
    `setworldspawn 0 ${y + 3} 2`,
    `fill -4 ${y} -4 4 ${y} 4 ${base}`,
    `fill -3 ${y + 1} -3 3 ${y + 1} 3 ${middle}`,
    `fill -3 ${y + 2} -3 3 ${y + 2} 3 ${top}`,
    `setblock 1 ${y + 3} -1 minecraft:crafting_table`,
    `setblock -1 ${y + 3} -1 minecraft:furnace`,
    `setblock 0 ${y + 3} -2 minecraft:chest`,
    `setblock 1 ${y + 3} 2 minecraft:torch`
  ]
  if (theme === 'desert') {
    commands.push(
      `setblock 2 ${y + 3} 2 minecraft:cactus`,
      `setblock 2 ${y + 4} 2 minecraft:cactus`,
      `setblock -2 ${y + 3} 2 minecraft:dead_bush`
    )
  } else if (theme === 'snow') {
    commands.push(
      `fill 2 ${y + 3} 2 2 ${y + 5} 2 ${log}`,
      `fill 1 ${y + 5} 1 3 ${y + 6} 3 ${leaf} replace minecraft:air`,
      `setblock -2 ${y + 3} 2 minecraft:packed_ice`
    )
  } else if (theme === 'nether') {
    commands.push(
      `fill 2 ${y + 3} 2 2 ${y + 5} 2 ${log}`,
      `fill 1 ${y + 5} 1 3 ${y + 6} 3 ${leaf} replace minecraft:air`,
      `setblock -2 ${y + 3} 2 minecraft:glowstone`,
      `setblock -2 ${y + 2} 2 minecraft:magma_block`
    )
  } else {
    commands.push(
      `fill 2 ${y + 3} 2 2 ${y + 6} 2 ${log}`,
      `fill 1 ${y + 6} 1 3 ${y + 7} 3 ${leaf} replace minecraft:air`
    )
  }
  return commands
}

function detectVersionFromLog(log: string): string | null {
  const starts = [...log.matchAll(/Starting minecraft server version\s+([0-9][^\s,]*)/gi)]
  const direct = starts[starts.length - 1]?.[1]
  if (direct) return direct.replace(/[^\w.-]/g, '')
  const paper = log.match(/MC:\s*([0-9][\w.-]*)/i)
  return paper?.[1] ?? null
}

function pickServerJar(files: string[]): string | null {
  const jars = files.filter(
    (file) => file.toLowerCase().endsWith('.jar') && !/installer/i.test(file)
  )
  const preferred = [
    'server.jar',
    'fabric-server-launch.jar',
    'fabric-server.jar',
    'minecraft_server.jar'
  ]
  for (const name of preferred) {
    const found = jars.find((file) => file.toLowerCase() === name)
    if (found) return found
  }
  const patterns = [
    /fabric.*server.*\.jar$/i,
    /paper.*\.jar$/i,
    /spigot.*\.jar$/i,
    /purpur.*\.jar$/i,
    /server.*\.jar$/i
  ]
  for (const pattern of patterns) {
    const found = jars.find((file) => pattern.test(file))
    if (found) return found
  }
  return jars[0] ?? null
}

function lanAddresses(): string[] {
  const found: string[] = []
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    if (/vEthernet|VirtualBox|VMware|Hyper-V|Loopback|Docker|WSL/i.test(name)) continue
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      if (entry.address.startsWith('169.254.')) continue
      if (!found.includes(entry.address)) found.push(entry.address)
    }
  }
  const rank = (address: string): number =>
    address.startsWith('192.168.')
      ? 0
      : address.startsWith('10.')
        ? 1
        : address.startsWith('172.')
          ? 2
          : 3
  return found.sort((left, right) => rank(left) - rank(right)).slice(0, 2)
}

function resolveHost(host: string): Promise<string[]> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('The DNS lookup timed out.')), DNS_TIMEOUT_MS)
    lookup(host, { all: true })
      .then((rows) => {
        clearTimeout(timer)
        resolvePromise(rows.map((row) => row.address))
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

export class ServerManager {
  private managed = new Map<string, Managed>()
  private details = new Map<string, Promise<VanillaDetail>>()
  private fabricInstaller: Promise<string> | null = null

  constructor(private readonly store: Store) {}

  private ensure(id: string): Managed {
    const existing = this.managed.get(id)
    if (existing) return existing
    const managed: Managed = {
      state: { id, status: 'stopped', players: 0, message: 'Not started yet.' },
      log: [],
      stopping: false
    }
    this.managed.set(id, managed)
    return managed
  }

  states(): Record<string, HostedServerState> {
    const result: Record<string, HostedServerState> = {}
    for (const server of this.store.data.servers) {
      result[server.id] = { ...this.ensure(server.id).state }
    }
    return result
  }

  async joinInfo(id: string): Promise<HostedServerJoinInfo> {
    const server = this.store.requireServer(id)
    const local = `localhost:${server.port}`
    const lan = lanAddresses().map((address) => `${address}:${server.port}`)
    const info: HostedServerJoinInfo = { local, lan }
    const parsed = server.address ? parseServerAddress(server.address) : null
    if (!parsed) return info
    const address = serverJoinAddress(server.address ?? '', server.port)
    if (isLoopbackHost(parsed.host)) {
      info.custom = { address, resolves: true, addresses: ['127.0.0.1'] }
      return info
    }
    if (isIpv4(parsed.host)) {
      info.custom = { address, resolves: true, addresses: [parsed.host] }
      return info
    }
    try {
      const addresses = await resolveHost(parsed.host)
      info.custom = { address, resolves: addresses.length > 0, addresses }
    } catch {
      info.custom = { address, resolves: false, addresses: [] }
    }
    return info
  }

  private async logJoinInfo(server: HostedServer): Promise<void> {
    this.writeLog(server.id, `[Triad] Join on this PC: localhost:${server.port}`)
    const lan = lanAddresses()
    if (lan.length) {
      this.writeLog(
        server.id,
        `[Triad] Friends on the same network: ${lan
          .map((address) => `${address}:${server.port}`)
          .join(' or ')}`
      )
    }
    if (!server.address) return
    const info = await this.joinInfo(server.id).catch(() => null)
    const custom = info?.custom
    if (!custom) return
    if (custom.resolves) {
      this.writeLog(server.id, `[Triad] Custom address ${custom.address} resolves in DNS.`)
    } else {
      this.writeLog(
        server.id,
        `[Triad] ${custom.address} does not resolve in DNS yet, so Minecraft will say "Unknown host". Use localhost:${server.port} or the network address above until it points here.`
      )
    }
  }

  state(id: string): HostedServerState {
    this.store.requireServer(id)
    return { ...this.ensure(id).state }
  }

  logs(id: string): string[] {
    this.store.requireServer(id)
    return [...this.ensure(id).log]
  }

  runningCount(): number {
    return [...this.managed.values()].filter((managed) => !!managed.process).length
  }

  private setState(id: string, patch: Partial<HostedServerState>): void {
    const managed = this.ensure(id)
    managed.state = { ...managed.state, ...patch, id }
    events.hostState({ ...managed.state })
  }

  private writeLog(id: string, line: string): void {
    const managed = this.ensure(id)
    managed.log.push(line)
    if (managed.log.length > MAX_LOG_LINES) {
      managed.log.splice(0, managed.log.length - MAX_LOG_LINES)
    }
    events.hostLog({ id, line })
  }

  create(input: CreateHostedServerInput): HostedServer {
    const name = String(input?.name ?? '').trim().slice(0, 48)
    if (!name) throw new Error('Give the server a name.')
    const mcVersion = String(input?.mcVersion ?? '').trim()
    if (!/^[a-z0-9._-]{1,32}$/i.test(mcVersion)) {
      throw new Error('Choose a Minecraft version for the server.')
    }
    const address = normalizeServerAddress(input?.address ?? '')
    if (address.error) throw new Error(address.error)
    const software: ServerSoftware = input?.software === 'fabric' ? 'fabric' : 'vanilla'
    const worldPreset: WorldPreset = WORLD_PRESETS.includes(input?.worldPreset ?? 'default')
      ? (input?.worldPreset ?? 'default')
      : 'default'
    const islandTheme: IslandTheme = ISLAND_THEMES.includes(input?.islandTheme ?? 'grass')
      ? (input?.islandTheme ?? 'grass')
      : 'grass'
    const server: HostedServer = {
      id: uid('srv_'),
      name,
      mcVersion,
      software,
      port: clamp(input?.port ?? 25565, 1024, 65535, 25565),
      memoryMb: clamp(input?.memoryMb ?? 2048, 1024, 32768, 2048),
      created: Date.now(),
      properties: {
        ...defaultProperties(name),
        ...(input?.levelSeed
          ? { 'level-seed': String(input.levelSeed).replace(/[\r\n]/g, '').slice(0, 64) }
          : {})
      },
      commands: [],
      address: address.address,
      gamerules: {},
      worldPreset,
      islandTheme,
      autoSaveMinutes: 0
    }
    this.store.data.servers.push(server)
    this.store.save()
    this.ensure(server.id).state = {
      id: server.id,
      status: 'stopped',
      players: 0,
      message: 'Ready to install and start.'
    }
    events.hostState({ ...this.ensure(server.id).state })
    return server
  }

  update(id: string, patch: HostedServerPatch): HostedServer {
    const server = this.store.requireServer(id)
    if (typeof patch.name === 'string') {
      const name = patch.name.trim()
      if (!name) throw new Error('The server name cannot be empty.')
      server.name = name.slice(0, 48)
    }
    if (patch.port !== undefined) {
      server.port = clamp(patch.port, 1024, 65535, server.port)
    }
    if (patch.memoryMb !== undefined) {
      server.memoryMb = clamp(patch.memoryMb, 1024, 32768, server.memoryMb)
    }
    if (patch.address !== undefined) {
      if (patch.address === null || String(patch.address).trim() === '') {
        server.address = undefined
      } else {
        const address = normalizeServerAddress(String(patch.address))
        if (address.error) throw new Error(address.error)
        server.address = address.address
      }
    }
    if (patch.properties !== undefined) {
      server.properties = { ...server.properties, ...cleanProperties(patch.properties) }
    }
    const nextGamerules =
      patch.gamerules !== undefined ? cleanGamerules(patch.gamerules) : null
    if (nextGamerules !== null) {
      server.gamerules = nextGamerules
    }
    if (patch.worldPreset !== undefined && WORLD_PRESETS.includes(patch.worldPreset)) {
      server.worldPreset = patch.worldPreset
    }
    if (patch.islandTheme !== undefined && ISLAND_THEMES.includes(patch.islandTheme)) {
      server.islandTheme = patch.islandTheme
    }
    if (patch.autoSaveMinutes !== undefined) {
      server.autoSaveMinutes = clamp(patch.autoSaveMinutes, 0, 720, 0)
    }
    this.store.save()

    const managed = this.managed.get(id)
    if (managed?.process) {
      if (nextGamerules && Object.keys(nextGamerules).length) {
        for (const [key, value] of Object.entries(nextGamerules)) {
          this.sendRaw(id, `gamerule ${key} ${value}`)
        }
        this.writeLog(
          id,
          `[Triad] Applied ${Object.keys(nextGamerules).length} world rule${
            Object.keys(nextGamerules).length === 1 ? '' : 's'
          } to the running server.`
        )
      }
      if (patch.autoSaveMinutes !== undefined) this.armAutoSave(server, managed)
      if (patch.port !== undefined || patch.memoryMb !== undefined) {
        this.writeLog(id, '[Triad] Port and memory changes apply after a restart.')
      }
      if (patch.worldPreset !== undefined) {
        const levelName = server.properties['level-name'] || 'world'
        if (existsSync(join(this.store.serverDir(id), levelName, 'level.dat'))) {
          this.writeLog(id, '[Triad] World generation changes apply to a new world only.')
        }
      }
    }
    return server
  }

  addCommand(id: string, label: string, command: string): HostedServer {
    const server = this.store.requireServer(id)
    const safeLabel = String(label ?? '').trim().slice(0, 40)
    const safeCommand = String(command ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, 200)
    if (!safeLabel) throw new Error('Give the command a label.')
    if (!safeCommand) throw new Error('Enter a command to run.')
    server.commands = [
      ...(server.commands ?? []),
      { id: uid('cmd_'), label: safeLabel, command: safeCommand }
    ].slice(0, 40)
    this.store.save()
    return server
  }

  removeCommand(id: string, commandId: string): HostedServer {
    const server = this.store.requireServer(id)
    server.commands = (server.commands ?? []).filter((entry) => entry.id !== commandId)
    this.store.save()
    return server
  }

  async importFolder(source: string): Promise<HostedServer> {
    const sourcePath = resolve(source)
    const serversRoot = resolve(this.store.serversRoot)
    if (
      sourcePath === serversRoot ||
      isInside(serversRoot, sourcePath) ||
      isInside(sourcePath, serversRoot)
    ) {
      throw new Error("Choose a server folder outside Triad's own server storage.")
    }
    if (!existsSync(sourcePath)) throw new Error('That folder no longer exists.')
    const entries = await readdir(sourcePath, { withFileTypes: true }).catch(() => {
      throw new Error('That folder could not be read.')
    })
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
    const jars = pickServerJar(files)
    if (!jars) {
      throw new Error(
        'No server jar was found in that folder. Pick the folder that contains server.jar or the Paper/Fabric jar.'
      )
    }
    const properties = await readFile(join(sourcePath, 'server.properties'), 'utf8')
      .then(parseProperties)
      .catch(() => ({}) as Record<string, string>)
    let mcVersion = 'unknown'
    const latestLog = await readFile(join(sourcePath, 'logs', 'latest.log'), 'utf8').catch(
      () => ''
    )
    const detected = detectVersionFromLog(latestLog)
    if (detected) mcVersion = detected
    if (mcVersion === 'unknown') {
      const history = await readFile(join(sourcePath, 'version_history.json'), 'utf8')
        .then((text) => JSON.parse(text) as { currentVersion?: string })
        .catch(() => null)
      const match = history?.currentVersion?.match(/MC:\s*([0-9][\w.-]*)/i)
      if (match) mcVersion = match[1]
    }
    if (mcVersion === 'unknown') {
      mcVersion = await latestRelease().catch(() => 'unknown')
    }
    let javaMajor = 21
    if (mcVersion !== 'unknown') {
      javaMajor = await this.versionDetail(mcVersion)
        .then((detail) => detail.javaVersion?.majorVersion ?? 21)
        .catch(() => 21)
    }
    const software: ServerSoftware =
      /fabric/i.test(jars) || entries.some((entry) => entry.isDirectory() && entry.name === '.fabric')
        ? 'fabric'
        : 'vanilla'
    const id = uid('srv_')
    const destination = this.store.serverDir(id)
    try {
      await cp(sourcePath, destination, { recursive: true, force: true, errorOnExist: false })
    } catch (error) {
      await rm(destination, { recursive: true, force: true }).catch(() => undefined)
      throw new Error(
        `Could not copy that server folder: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    const motd = String(properties.motd ?? '')
      .replace(/§./g, '')
      .trim()
    const folderName = basename(sourcePath).replace(/[^\w .-]/g, ' ').trim()
    const generic = /^(server|minecraft|paper|fabric|spigot|server1|smp)$/i.test(folderName)
    const name = (generic && motd ? motd : folderName || motd || 'Imported server').slice(0, 48)
    const imported: HostedServer = {
      id,
      name,
      mcVersion,
      software,
      port: clamp(Number(properties['server-port'] ?? 25565), 1024, 65535, 25565),
      memoryMb: 4096,
      created: Date.now(),
      properties,
      commands: [],
      gamerules: {},
      islandTheme: 'grass',
      autoSaveMinutes: 0,
      imported: true,
      sourcePath,
      jarFile: jars,
      javaMajor
    }
    await writeJson(join(destination, '.triad-host.json'), {
      imported: true,
      mcVersion,
      software,
      jarFile: jars,
      javaMajor,
      builtAt: Date.now()
    } satisfies HostMarker & { imported?: boolean; jarFile?: string })
    this.store.data.servers.push(imported)
    this.store.save()
    this.ensure(id).state = {
      id,
      status: 'stopped',
      players: 0,
      message: 'Imported and ready to start.'
    }
    events.hostState({ ...this.ensure(id).state })
    return imported
  }

  async start(id: string): Promise<void> {
    const server = this.store.requireServer(id)
    const managed = this.ensure(id)
    if (managed.process) return
    if (managed.state.status === 'installing' || managed.state.status === 'starting') return

    managed.stopping = false
    managed.rulesApplied = false
    managed.islandBuilt = false
    this.setState(id, {
      status: 'installing',
      message: 'Preparing the server…',
      progress: 0,
      players: 0,
      startedAt: undefined
    })

    try {
      for (const [otherId, other] of this.managed) {
        if (otherId === id || !other.process) continue
        const otherServer = this.store.getServer(otherId)
        if (otherServer?.port === server.port) {
          throw new Error(
            `Port ${server.port} is already used by ${otherServer.name}. Stop that server or change this one's port.`
          )
        }
      }

      const dir = this.store.serverDir(id)
      await ensureDir(dir)
      const levelName = server.properties['level-name'] || 'world'
      const worldExisted = existsSync(join(dir, levelName, 'level.dat'))
      const { javaMajor } = await this.ensureServerFiles(server, dir)
      const { java } = await ensureJava(
        javaMajor,
        this.store.settings.javaPath,
        (progress, stage) => {
          this.setState(id, { status: 'installing', message: stage, progress })
        }
      )

      await this.writeServerProperties(server, dir)
      await writeFile(join(dir, 'eula.txt'), 'eula=true\n', 'utf8')

      if (managed.process) return
      const child = spawn(
        java.path,
        [
          `-Xms${Math.min(server.memoryMb, 1024)}M`,
          `-Xmx${server.memoryMb}M`,
          '-jar',
          server.jarFile ?? 'server.jar',
          'nogui'
        ],
        { cwd: dir, windowsHide: true }
      )
      managed.process = child
      managed.stopping = false
      managed.buildIsland =
        !worldExisted &&
        (server.worldPreset === 'island' || server.worldPreset === 'sky_island')
      this.attach(server, child, managed)
      this.setState(id, {
        status: 'starting',
        message: 'Starting the server…',
        progress: null,
        startedAt: Date.now()
      })
      this.writeLog(id, `[Triad] Starting ${server.name} on port ${server.port} with Java ${java.major}.`)
      server.lastStarted = Date.now()
      this.store.save()
      this.armAutoSave(server, managed)
    } catch (error) {
      this.clearAutoSave(managed)
      managed.process = undefined
      const message = error instanceof Error ? error.message : String(error)
      this.writeLog(id, `[Triad] ${message}`)
      this.setState(id, { status: 'error', message, progress: undefined, players: 0 })
    }
  }

  async stop(id: string): Promise<void> {
    this.store.requireServer(id)
    const managed = this.ensure(id)
    const child = managed.process
    if (!child) {
      this.clearAutoSave(managed)
      this.setState(id, {
        status: 'stopped',
        message: 'Server stopped.',
        players: 0,
        progress: undefined,
        startedAt: undefined
      })
      return
    }
    managed.stopping = true
    this.clearAutoSave(managed)
    this.setState(id, { status: 'stopping', message: 'Saving the world and stopping…', progress: null })
    this.writeLog(id, '[Triad] Stopping the server…')
    try {
      child.stdin.write('stop\n')
    } catch {
      // The process may already be gone.
    }
    await new Promise<void>((resolvePromise) => {
      if (child.exitCode !== null) return resolvePromise()
      const timer = setTimeout(() => {
        child.kill()
        resolvePromise()
      }, STOP_TIMEOUT_MS)
      child.once('close', () => {
        clearTimeout(timer)
        resolvePromise()
      })
    })
    if (managed.process === child) managed.process = undefined
    if (this.ensure(id).state.status === 'stopping') {
      this.setState(id, {
        status: 'stopped',
        message: 'Server stopped.',
        players: 0,
        progress: undefined,
        startedAt: undefined
      })
    }
  }

  sendCommand(id: string, raw: string): void {
    this.store.requireServer(id)
    const managed = this.ensure(id)
    const command = String(raw ?? '')
      .replace(/[\r\n]/g, ' ')
      .trim()
      .slice(0, 500)
    if (!command) return
    if (!managed.process) throw new Error('Start the server before sending commands.')
    this.sendRaw(id, command)
    this.writeLog(id, `> ${command}`)
  }

  private sendRaw(id: string, command: string): boolean {
    const managed = this.managed.get(id)
    if (!managed?.process) return false
    try {
      managed.process.stdin.write(`${command}\n`)
      return true
    } catch {
      return false
    }
  }

  async remove(id: string): Promise<void> {
    this.store.requireServer(id)
    const status = this.ensure(id).state.status
    if (status === 'installing' || status === 'starting' || status === 'stopping') {
      throw new Error('Wait for the server to finish starting or stopping before deleting it.')
    }
    if (this.managed.get(id)?.process) {
      await this.stop(id)
    }
    const managed = this.managed.get(id)
    if (managed) this.clearAutoSave(managed)
    await rm(this.store.serverDir(id), { recursive: true, force: true })
    this.store.removeServer(id)
    this.managed.delete(id)
  }

  async backup(id: string): Promise<ServerBackup> {
    const server = this.store.requireServer(id)
    const managed = this.ensure(id)
    if (managed.state.status === 'installing' || managed.state.status === 'starting') {
      throw new Error('Wait for the server to finish starting before making a backup.')
    }
    const dir = this.store.serverDir(id)
    const levelName = server.properties['level-name'] || 'world'
    if (!existsSync(join(dir, levelName))) {
      throw new Error('Start the server once before making a backup.')
    }
    const wasRunning = !!managed.process
    if (wasRunning) {
      this.sendRaw(id, 'save-all')
      await sleep(500)
      this.sendRaw(id, 'save-off')
      await sleep(700)
    }
    const now = new Date()
    const pad = (value: number): string => String(value).padStart(2, '0')
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
      now.getHours()
    )}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${String(now.getMilliseconds()).padStart(3, '0')}`
    const backupDir = join(dir, 'backups', stamp)
    try {
      await ensureDir(backupDir)
      const names = [
        levelName,
        `${levelName}_nether`,
        `${levelName}_the_end`,
        'server.properties',
        'eula.txt',
        'ops.json',
        'whitelist.json',
        'banned-players.json',
        'banned-ips.json'
      ]
      for (const name of names) {
        if (!existsSync(join(dir, name))) continue
        await cp(join(dir, name), join(backupDir, name), { recursive: true, force: true })
      }
    } finally {
      if (wasRunning) this.sendRaw(id, 'save-on')
    }
    const info = await stat(backupDir)
    this.writeLog(id, `[Triad] Created a world backup: ${stamp}`)
    return { name: stamp, path: backupDir, createdAt: info.mtimeMs }
  }

  async backups(id: string): Promise<ServerBackup[]> {
    this.store.requireServer(id)
    const root = join(this.store.serverDir(id), 'backups')
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    const result: ServerBackup[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const path = join(root, entry.name)
      const info = await stat(path).catch(() => null)
      result.push({ name: entry.name, path, createdAt: info?.mtimeMs ?? 0 })
    }
    return result.sort((a, b) => b.createdAt - a.createdAt)
  }

  async dispose(): Promise<void> {
    for (const managed of this.managed.values()) this.clearAutoSave(managed)
    const running = [...this.managed.entries()].filter(([, managed]) => !!managed.process)
    await Promise.all(running.map(([id]) => this.stop(id).catch(() => undefined)))
  }

  private clearAutoSave(managed: Managed): void {
    if (managed.autoSave) {
      clearInterval(managed.autoSave)
      managed.autoSave = undefined
    }
  }

  private armAutoSave(server: HostedServer, managed: Managed): void {
    this.clearAutoSave(managed)
    const minutes = server.autoSaveMinutes ?? 0
    if (!minutes || minutes <= 0 || !managed.process) return
    managed.autoSave = setInterval(
      () => {
        if (managed.process) this.sendRaw(server.id, 'save-all')
      },
      Math.min(720, Math.max(1, minutes)) * 60_000
    )
  }

  private applyGamerules(server: HostedServer): void {
    const rules = server.gamerules ?? {}
    const entries = Object.entries(rules)
    for (const [key, value] of entries) this.sendRaw(server.id, `gamerule ${key} ${value}`)
    if (server.worldPreset === 'island' || server.worldPreset === 'sky_island') {
      this.sendRaw(server.id, 'gamerule spawnRadius 0')
    }
    if (entries.length) {
      this.writeLog(
        server.id,
        `[Triad] Applied ${entries.length} saved world rule${entries.length === 1 ? '' : 's'}.`
      )
    }
  }

  private buildIsland(server: HostedServer): void {
    const preset = server.worldPreset
    if (preset !== 'island' && preset !== 'sky_island') return
    const theme = server.islandTheme ?? 'grass'
    this.writeLog(server.id, `[Triad] Building a ${theme} starter island at spawn…`)
    for (const command of islandCommands(theme, islandHeight(preset))) {
      this.sendRaw(server.id, command)
    }
  }

  private async ensureServerFiles(
    server: HostedServer,
    dir: string
  ): Promise<{ javaMajor: number }> {
    if (server.imported) {
      const jarFile = server.jarFile ?? 'server.jar'
      if (!existsSync(join(dir, jarFile))) {
        throw new Error(
          `The imported server folder has no ${jarFile}. Add the server jar to the folder and import it again.`
        )
      }
      return { javaMajor: server.javaMajor ?? 21 }
    }
    const jarPath = join(dir, 'server.jar')
    const markerPath = join(dir, '.triad-host.json')
    const marker = await readJson<HostMarker>(markerPath, {})
    const loaderVersion = server.loaderVersion ?? ''
    if (
      marker.mcVersion === server.mcVersion &&
      marker.software === server.software &&
      (marker.loaderVersion ?? '') === loaderVersion &&
      typeof marker.javaMajor === 'number' &&
      existsSync(jarPath)
    ) {
      return { javaMajor: marker.javaMajor }
    }

    this.setState(server.id, {
      status: 'installing',
      message: 'Checking Minecraft version metadata…',
      progress: 0
    })
    const detail = await this.versionDetail(server.mcVersion)
    const javaMajor = detail.javaVersion?.majorVersion ?? 21
    let url = ''
    let size: number | undefined
    let sha1: string | undefined

    if (server.software === 'fabric') {
      if (!server.loaderVersion) {
        const loaders = await fetchJson<FabricLoaderEntry[]>(
          `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(server.mcVersion)}`
        )
        const chosen = loaders.find((entry) => entry.loader?.stable) ?? loaders[0]
        const resolved = chosen?.loader?.version ?? ''
        if (!resolved) {
          throw new Error(`No Fabric server build is available for Minecraft ${server.mcVersion}.`)
        }
        server.loaderVersion = resolved
        this.store.save()
      }
      const installerVersion = await this.fabricInstallerVersion()
      url = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(
        server.mcVersion
      )}/${encodeURIComponent(server.loaderVersion)}/${encodeURIComponent(
        installerVersion
      )}/server/jar`
    } else {
      const download = detail.downloads?.server
      if (!download?.url) {
        throw new Error(`Minecraft ${server.mcVersion} does not offer a server download.`)
      }
      url = download.url
      size = download.size
      sha1 = download.sha1
    }

    this.writeLog(
      server.id,
      server.software === 'fabric'
        ? `[Triad] Downloading Fabric ${server.loaderVersion} for Minecraft ${server.mcVersion}…`
        : `[Triad] Downloading the Vanilla ${server.mcVersion} server…`
    )
    await downloadFile(url, jarPath, {
      size,
      sha1,
      onProgress: (received, total) => {
        this.setState(server.id, {
          message: `Downloading the server (${formatBytes(received)}${
            total ? ` of ${formatBytes(total)}` : ''
          })`,
          progress: total ? received / total : null
        })
      }
    })

    await writeJson(markerPath, {
      mcVersion: server.mcVersion,
      software: server.software,
      loaderVersion: server.loaderVersion ?? '',
      javaMajor,
      builtAt: Date.now()
    } satisfies HostMarker)
    return { javaMajor }
  }

  private fabricInstallerVersion(): Promise<string> {
    if (!this.fabricInstaller) {
      const request = (async () => {
        const installers = await fetchJson<FabricInstallerEntry[]>(
          'https://meta.fabricmc.net/v2/versions/installer'
        )
        const chosen = installers.find((entry) => entry.stable) ?? installers[0]
        if (!chosen?.version) {
          throw new Error('Could not find a Fabric installer version.')
        }
        return chosen.version
      })()
      this.fabricInstaller = request
      void request.catch(() => {
        this.fabricInstaller = null
      })
    }
    return this.fabricInstaller
  }

  private versionDetail(mcVersion: string): Promise<VanillaDetail> {
    const cached = this.details.get(mcVersion)
    if (cached) return cached
    const request = (async () => {
      const manifest = await getManifest()
      const entry = manifest.versions.find((version) => version.id === mcVersion)
      if (!entry) {
        throw new Error(`Minecraft ${mcVersion} was not found in Mojang's version manifest.`)
      }
      return await fetchJson<VanillaDetail>(entry.url)
    })()
    this.details.set(mcVersion, request)
    void request.catch(() => this.details.delete(mcVersion))
    return request
  }

  private async writeServerProperties(server: HostedServer, dir: string): Promise<void> {
    const path = join(dir, 'server.properties')
    const existing = await readFile(path, 'utf8')
      .then(parseProperties)
      .catch(() => ({}) as Record<string, string>)
    const values = {
      ...PROPERTY_DEFAULTS,
      ...existing,
      ...server.properties,
      ...(server.worldPreset ? worldProperties(server.worldPreset) : {}),
      'server-port': String(server.port),
      motd: server.properties.motd || existing.motd || `${server.name} — hosted with Triad`
    }
    await writeFile(path, serializeProperties(values), 'utf8')
  }

  private attach(
    server: HostedServer,
    child: ChildProcessWithoutNullStreams,
    managed: Managed
  ): void {
    const id = server.id
    let buffer = ''
    const handle = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8')
      if (buffer.length > 16_000) buffer = buffer.slice(-8000)
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) this.handleLine(server, line, managed)
    }
    child.stdout.on('data', handle)
    child.stderr.on('data', handle)
    child.on('error', (error) => {
      this.clearAutoSave(managed)
      this.writeLog(id, `[Triad] ${error.message}`)
      managed.process = undefined
      this.setState(id, {
        status: 'error',
        message: error.message,
        players: 0,
        progress: undefined
      })
    })
    child.on('close', (code) => {
      if (buffer.trim()) this.handleLine(server, buffer, managed)
      buffer = ''
      this.clearAutoSave(managed)
      managed.process = undefined
      const wasStopping = managed.stopping
      managed.stopping = false
      if (wasStopping || code === 0) {
        this.writeLog(id, '[Triad] Server stopped.')
        this.setState(id, {
          status: 'stopped',
          message: 'Server stopped.',
          players: 0,
          progress: undefined,
          startedAt: undefined
        })
      } else {
        this.setState(id, {
          status: 'error',
          message: `The server exited unexpectedly (code ${code ?? 'unknown'}). Check the console.`,
          players: 0,
          progress: undefined
        })
      }
    })
  }

  private handleLine(server: HostedServer, raw: string, managed: Managed): void {
    const id = server.id
    const line = raw
      .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\s+$/, '')
    if (!line) return
    this.writeLog(id, line)
    if (/Done \([0-9.]+s\)!/.test(line)) {
      this.setState(id, {
        status: 'running',
        message: 'Server is running.',
        progress: undefined,
        startedAt: managed.state.startedAt ?? Date.now(),
        players: managed.state.players ?? 0
      })
      this.armAutoSave(server, managed)
      void this.logJoinInfo(server)
      if (!managed.rulesApplied || managed.buildIsland) {
        setTimeout(() => {
          if (!managed.process) return
          if (!managed.rulesApplied) {
            managed.rulesApplied = true
            this.applyGamerules(server)
          }
          if (managed.buildIsland && !managed.islandBuilt) {
            managed.islandBuilt = true
            this.buildIsland(server)
          }
        }, 1000)
      }
    }
    const list = line.match(/There are (\d+) of a max of (\d+) players online/i)
    if (list) {
      this.setState(id, { players: Number(list[1]) })
    } else if (/joined the game/i.test(line)) {
      this.setState(id, { players: Math.max(0, managed.state.players + 1) })
    } else if (/left the game/i.test(line)) {
      this.setState(id, { players: Math.max(0, managed.state.players - 1) })
    }
  }
}
