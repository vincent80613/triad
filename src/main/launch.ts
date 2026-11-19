import { BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createMinecraftProcessWatcher,
  launch as spawnMinecraft,
  type MinecraftProcessWatcher
} from '@xmcl/core'
import type { ChildProcess } from 'node:child_process'
import { explainAuthError } from '@shared/authErrors'
import type { Account, Instance, LaunchState } from '@shared/types'
import { ensureFreshAccount } from './auth'
import { events } from './events'
import { ensureJava } from './java'
import type { DiscordPresence } from './presence'
import type { Store } from './store'
import { ensureInstanceVersion } from './versions'

const MAX_LOG_LINES = 1500
const LOADER_NAMES: Record<Instance['loader'], string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}
const SINGLEPLAYER_START =
  /\b(?:Started serving on\s+\d+|Starting integrated minecraft server version)\b/i
const CONNECTION_ENDED =
  /\b(?:Disconnected from (?:the )?server|Connection (?:lost|reset|refused)|Lost connection|Disconnecting from server|Failed to connect|Could not connect|Couldn't connect to server|Unable to connect|Stopping singleplayer server as player logged out|Stopping server)\b/i

type PlayingContext =
  | { kind: 'multiplayer'; server: string }
  | { kind: 'singleplayer'; world?: string }

function clipPresence(value: string, max: number): string {
  return value.trim().slice(0, max)
}

function displayWorld(folder: string): string {
  const name = folder.replace(/_/g, ' ').replace(/[\\/:*?"<>|]/g, '').trim()
  return clipPresence(name || 'Singleplayer', 96)
}

function serverFromLog(line: string): string | null {
  const match = line.match(
    /\bConnecting to\s+(\[[0-9a-f:]+\]|[a-z0-9._-]+)(?:\s*[,:]\s*(\d{1,5}))?/i
  )
  if (!match) return null
  const host = match[1].toLowerCase()
  if (/^(?:the|a|an|server|world|multiplayer|singleplayer)$/i.test(host)) return null
  const port = Number.parseInt(match[2] ?? '', 10)
  const hasPort = Number.isInteger(port) && port > 0 && port <= 65535
  if (!hasPort && !host.includes('.') && host !== 'localhost' && !host.startsWith('[')) {
    return null
  }
  return clipPresence(hasPort && port !== 25565 ? `${host}:${port}` : host, 96)
}

function timestamp(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

function supportsQuickPlay(version: string): boolean {
  const [major, minor] = version.split('.').map((part) => Number.parseInt(part, 10))
  if (!Number.isFinite(major)) return true
  if (major > 1) return true
  return major === 1 && (minor ?? 0) >= 20
}

function parseServerAddress(address: string): { ip: string; port?: number; label: string } {
  const trimmed = address.trim()
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    if (end > 0) {
      const ip = trimmed.slice(1, end)
      const rest = trimmed.slice(end + 1).replace(/^:/, '')
      const port = rest ? Number.parseInt(rest, 10) : undefined
      return {
        ip,
        port: Number.isFinite(port) ? port : undefined,
        label: trimmed
      }
    }
  }
  const separator = trimmed.lastIndexOf(':')
  if (separator > 0) {
    const port = Number.parseInt(trimmed.slice(separator + 1), 10)
    if (Number.isFinite(port)) {
      return { ip: trimmed.slice(0, separator), port, label: trimmed }
    }
  }
  return { ip: trimmed, label: trimmed }
}

function parseJvmArgs(value?: string): string[] {
  if (!value) return []
  const args: string[] = []
  const pattern = /"([^"]*)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(value))) {
    args.push(match[1] ?? match[2])
  }
  return args
}

export class Launcher {
  private child: ChildProcess | null = null
  private watcher: MinecraftProcessWatcher | null = null
  private instanceId: string | null = null
  private startedAt = 0
  private stoppedByUser = false
  private state: LaunchState = { status: 'idle' }
  private logs = new Map<string, string[]>()
  private presenceContext: PlayingContext | null = null

  constructor(
    private store: Store,
    private presence: DiscordPresence
  ) {}

  getState(): LaunchState {
    return this.state
  }

  isRunning(): boolean {
    return this.child !== null
  }

  private setState(patch: Partial<LaunchState>): void {
    this.state = { ...this.state, ...patch }
    events.launchState(this.state)
  }

  start(instanceId: string, server?: string, world?: string): void {
    if (this.child) throw new Error('Minecraft is already running.')
    void this.run(instanceId, server, world)
  }

  private fail(error: unknown): void {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Launch failed.'
    this.setState({
      status: 'error',
      error: message,
      stage: 'Launch failed',
      progress: undefined,
      instanceId: this.instanceId ?? this.state.instanceId
    })
    events.toast({ title: 'Could not launch Minecraft', description: message, variant: 'error' })
  }

  private async run(instanceId: string, server?: string, world?: string): Promise<void> {
    const instance = this.store.requireInstance(instanceId)
    this.instanceId = instanceId
    this.stoppedByUser = false
    this.presenceContext = null
    this.presence.setActivity(null)
    this.setState({
      status: 'preparing',
      instanceId,
      stage: 'Preparing account',
      progress: 0.02,
      error: undefined,
      startedAt: Date.now(),
      pid: undefined
    })

    try {
      const account = this.store.data.account
      if (!account) {
        throw new Error('Sign in with Microsoft, or create an offline profile in Settings first.')
      }

      let active: Account = account
      if (account.type === 'microsoft') {
        this.setState({ stage: 'Refreshing your Microsoft session', progress: 0.04 })
        try {
          active = await ensureFreshAccount(account, this.store.settings.clientId)
        } catch (error) {
          const guidance = explainAuthError(error)
          throw new Error(
            [guidance.title, guidance.summary, guidance.steps[0]].filter(Boolean).join(' ')
          )
        }
        this.store.data.account = active
        this.store.save()
        events.account(active)
      }

      const preferredJava = instance.javaPath || this.store.settings.javaPath || undefined
      const { versionId, javaMajor } = await ensureInstanceVersion(
        instance,
        this.store,
        preferredJava,
        (progress, stage) => {
          this.setState({
            stage,
            progress: progress === null ? undefined : 0.05 + progress * 0.72
          })
        }
      )

      const required = javaMajor
      this.setState({ stage: 'Checking Java runtime', progress: 0.82 })
      const { java } = await ensureJava(required, preferredJava, (progress, stage) => {
        this.setState({
          stage,
          progress: progress === null ? undefined : 0.82 + progress * 0.1
        })
      })
      if (java.major < required) {
        throw new Error(`Minecraft ${instance.mcVersion} needs Java ${required} or newer.`)
      }

      const target = server ? parseServerAddress(server) : null
      this.presenceContext = target
        ? { kind: 'multiplayer', server: clipPresence(target.label, 96) }
        : world
          ? { kind: 'singleplayer', world: displayWorld(world) }
          : null
      this.setState({
        stage: target
          ? `Joining ${target.label}`
          : world
            ? `Opening ${world}`
            : 'Launching Minecraft',
        progress: 0.94
      })
      const child = await spawnMinecraft({
        gamePath: this.store.minecraftDir(instance.id),
        resourcePath: this.store.sharedDir,
        javaPath: java.path,
        version: versionId,
        gameProfile: { name: active.name, id: active.uuid },
        accessToken: active.type === 'microsoft' && active.accessToken ? active.accessToken : '0',
        userType: (active.type === 'microsoft' ? 'msa' : 'legacy') as 'mojang',
        minMemory: 512,
        maxMemory: instance.memoryMb || this.store.settings.memoryMb,
        extraJVMArgs: parseJvmArgs(instance.jvmArgs),
        launcherName: 'Triad',
        launcherBrand: 'Triad',
        versionType: 'Triad',
        extraExecOption: {
          detached: true,
          windowsHide: true
        },
        ...(target
          ? supportsQuickPlay(instance.mcVersion)
            ? { quickPlayMultiplayer: target.label }
            : { server: { ip: target.ip, port: target.port } }
          : world && supportsQuickPlay(instance.mcVersion)
            ? { quickPlaySingleplayer: world }
            : {})
      })

      this.child = child
      child.unref()
      this.startedAt = Date.now()
      this.attachLogs(child, instance.id)
      this.store.data.activeInstanceId = instance.id
      this.store.save()

      this.setState({
        status: 'running',
        stage: 'Minecraft is running',
        progress: 1,
        pid: child.pid,
        startedAt: this.startedAt
      })
      events.dataChanged('instances')
      this.updatePresence(instance)

      this.watcher = createMinecraftProcessWatcher(child)
      this.watcher.on('minecraft-window-ready', () => {
        this.setState({ status: 'running', stage: 'Minecraft is running', progress: 1 })
        if (this.store.settings.closeOnLaunch) {
          BrowserWindow.getAllWindows()[0]?.minimize()
        }
      })
      this.watcher.on('minecraft-exit', ({ code, crashReport }) => {
        const crashed = !this.stoppedByUser && (code !== 0 || !!crashReport)
        this.finish(code, crashed)
      })
      this.watcher.on('error', (error) => {
        this.fail(error)
        this.cleanup()
      })
      child.on('error', (error) => {
        this.fail(error)
        this.cleanup()
      })
    } catch (error) {
      this.fail(error)
      this.cleanup()
    }
  }

  private attachLogs(child: ChildProcess, instanceId: string): void {
    const buffer = this.logs.get(instanceId) ?? []
    this.logs.set(instanceId, buffer)
    const handle = (chunk: Buffer): void => {
      const lines = chunk.toString().split(/\r?\n/).filter((line) => line.length > 0)
      for (const line of lines) {
        buffer.push(`[${timestamp()}] ${line}`)
        events.launchLog(instanceId, line)
        this.handlePresenceLog(line)
      }
      if (buffer.length > MAX_LOG_LINES) {
        buffer.splice(0, buffer.length - MAX_LOG_LINES)
      }
    }
    child.stdout?.on('data', handle)
    child.stderr?.on('data', handle)
    child.on('close', () => {
      if (this.logs.get(instanceId)?.length === 0) this.logs.delete(instanceId)
    })
  }

  private updatePresence(instance: Instance): void {
    if (!this.startedAt) return
    const loader = LOADER_NAMES[instance.loader]
    const details = `Minecraft ${instance.mcVersion}${
      instance.loader !== 'vanilla' ? ` · ${loader}` : ''
    }`
    let state = 'In the menus'
    if (this.presenceContext?.kind === 'multiplayer') {
      state = this.store.settings.discordHideServerAddress
        ? 'Multiplayer'
        : `Multiplayer · ${this.presenceContext.server}`
    } else if (this.presenceContext?.kind === 'singleplayer') {
      state = `Singleplayer${
        this.presenceContext.world ? ` · ${this.presenceContext.world}` : ''
      }`
    }
    this.presence.setActivity({
      details: clipPresence(details, 120),
      state: clipPresence(state, 120),
      startTimestamp: this.startedAt
    })
  }

  private handlePresenceLog(line: string): void {
    if (!this.instanceId || !this.startedAt) return
    const instance = this.store.getInstance(this.instanceId)
    if (!instance) return

    let next = this.presenceContext
    const server = serverFromLog(line)
    if (server) {
      next = { kind: 'multiplayer', server }
    } else if (SINGLEPLAYER_START.test(line)) {
      next = {
        kind: 'singleplayer',
        world: this.presenceContext?.kind === 'singleplayer' ? this.presenceContext.world : undefined
      }
    } else if (!/\blost connection:/i.test(line) && CONNECTION_ENDED.test(line)) {
      next = null
    } else {
      return
    }

    this.presenceContext = next
    this.updatePresence(instance)
  }

  private finish(code: number | null, crashed: boolean): void {
    if (this.startedAt) {
      const duration = Math.max(0, Date.now() - this.startedAt)
      if (this.instanceId && duration > 3000) {
        this.store.recordSession(this.instanceId, this.startedAt, duration, crashed)
        events.dataChanged('stats')
        events.dataChanged('instances')
      }
    }
    const wasStopped = this.stoppedByUser
    this.cleanup()
    this.setState({
      status: 'idle',
      stage: undefined,
      progress: undefined,
      pid: undefined,
      instanceId: this.instanceId ?? undefined
    })
    if (!wasStopped) {
      events.toast({
        title: crashed ? 'Minecraft crashed' : 'Minecraft closed',
        description: crashed
          ? `The game exited with code ${code ?? 'unknown'}. Check the Logs tab for details.`
          : 'See you next time.',
        variant: crashed ? 'error' : 'default'
      })
    }
  }

  private cleanup(): void {
    this.watcher?.removeAllListeners()
    this.watcher = null
    this.child = null
    this.startedAt = 0
    this.presenceContext = null
    this.presence.setActivity(null)
  }

  setPresenceEnabled(enabled: boolean): void {
    if (enabled) this.presence.start()
    else this.presence.stop()
  }

  refreshPresence(): void {
    const instance = this.instanceId ? this.store.getInstance(this.instanceId) : undefined
    if (instance && this.startedAt) this.updatePresence(instance)
  }

  dispose(): void {
    this.presence.stop()
  }

  stop(): void {
    if (!this.child) {
      this.setState({ status: 'idle' })
      return
    }
    this.stoppedByUser = true
    this.setState({ status: 'stopping', stage: 'Stopping Minecraft' })
    const child = this.child
    try {
      child.kill()
    } catch {
      // ignore
    }
    setTimeout(() => {
      if (this.child === child) {
        try {
          child.kill('SIGKILL')
        } catch {
          // ignore
        }
        this.finish(0, false)
      }
    }, 8000)
  }

  async getLogs(instanceId: string): Promise<string> {
    const buffer = this.logs.get(instanceId)
    if (buffer?.length) return buffer.join('\n')
    try {
      const text = await readFile(
        join(this.store.minecraftDir(instanceId), 'logs', 'latest.log'),
        'utf8'
      )
      return text.split('\n').slice(-600).join('\n')
    } catch {
      return ''
    }
  }
}
