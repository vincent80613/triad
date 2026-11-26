import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, shell } from 'electron'
import type { HostedServer, PublicAccessStatus } from '@shared/types'
import { downloadFile, ensureDir, fileSize, readJson, sha256File, sleep, writeJson } from './util'

const API_BASE = 'https://api.playit.gg'
const AGENT_VERSION = '2.0.2'
const AGENT_URL =
  'https://github.com/playit-cloud/playit-agent/releases/download/v2.0.2/playitd-windows-x86_64-signed.exe'
const AGENT_SHA256 = '6e62da9f56a3bcf72e0c62c29e94609c847cc9b110c460f68b20035525985238'
const AGENT_SIZE = 7_848_544
const CLAIM_TIMEOUT_MS = 10 * 60_000
const ADDRESS_WAIT_ATTEMPTS = 30
const CLAIM_URL = (code: string): string => `https://playit.gg/claim/${code}`

interface StoredTunnel {
  id: string
  address: string
  port: number
  name: string
}

interface PlayitConfig {
  secret?: string
  agentId?: string
  tunnels: Record<string, StoredTunnel>
}

interface ClaimJob {
  code: string
  serverId: string
  cancel: boolean
}

interface ApiEnvelope<T> {
  status?: 'success' | 'fail' | 'error'
  data?: T
}

interface AgentRunData {
  agent_id?: string
  permissions?: { account_status?: string }
}

interface AgentOriginDetails {
  agent_id?: string
  name?: string
}

interface TunnelOrigin {
  type?: string
  details?: AgentOriginDetails
}

interface ConnectAddressValue {
  address?: string
  domain?: string
  default_port?: number
}

interface ConnectAddress {
  type?: string
  value?: ConnectAddressValue
}

interface PublicAllocationDetails {
  auto_domain?: string
  hostname?: string
  ip?: string
  port?: number
}

interface PublicAllocation {
  type?: string
  details?: PublicAllocationDetails
}

interface AccountTunnel {
  id: string
  name?: string | null
  tunnel_type?: string | null
  user_enabled?: boolean
  origin?: TunnelOrigin
  connect_addresses?: ConnectAddress[]
  public_allocations?: PublicAllocation[]
}

class PlayitApiError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'PlayitApiError'
    this.code = code
  }
}

function agentIdForTunnel(tunnel: AccountTunnel): string | undefined {
  if (tunnel.origin?.type !== 'agent') return undefined
  return tunnel.origin.details?.agent_id
}

function extractAddress(tunnel: AccountTunnel): string | undefined {
  const addresses = Array.isArray(tunnel.connect_addresses) ? tunnel.connect_addresses : []
  const valueOf = (type: string): ConnectAddressValue | undefined =>
    addresses.find((entry) => entry.type === type)?.value
  const named = valueOf('domain') ?? valueOf('auto')
  if (named?.address) return named.address
  if (named?.domain) return named.domain
  const socket = valueOf('addr4') ?? valueOf('addr6')
  if (socket?.address) return socket.address
  const raw = valueOf('ip4') ?? valueOf('ip6')
  if (raw?.address) {
    return raw.default_port ? `${raw.address}:${raw.default_port}` : raw.address
  }
  const allocations = Array.isArray(tunnel.public_allocations) ? tunnel.public_allocations : []
  const gateway = allocations.find((entry) => entry.type === 'Gateway')?.details?.hostname
  if (gateway) return gateway
  const allocation = allocations.find((entry) => entry.type === 'PortAllocation')?.details
  if (allocation?.auto_domain) return allocation.auto_domain
  if (allocation?.ip && allocation.port) return `${allocation.ip}:${allocation.port}`
  return undefined
}

function tunnelName(server: HostedServer): string {
  const base = `Triad ${server.name}`
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 26)
  const suffix = server.id.replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'srv'
  return `${base || 'Triad server'} ${suffix}`.slice(0, 32).trim()
}

function localFields(server: HostedServer): Array<{ name: string; value: string }> {
  return [
    { name: 'local_ip', value: '127.0.0.1' },
    { name: 'local_port', value: String(server.port) }
  ]
}

function describeError(error: unknown): { error: string; helpUrl?: string } {
  if (error instanceof PlayitApiError) {
    switch (error.code) {
      case 'EmailNotVerified':
      case 'EmailMustBeVerified':
      case 'RequiresVerifiedAccount':
        return {
          error: 'Verify your email address on playit.gg, then try again.',
          helpUrl: 'https://playit.gg/account'
        }
      case 'AgentOverLimit':
      case 'agent-over-limit':
        return {
          error: 'Your playit account has reached its agent limit. Remove an old agent and try again.',
          helpUrl: 'https://playit.gg/account/agents'
        }
      case 'agent-disabled':
      case 'banned':
        return {
          error: 'playit has disabled this account or agent. Check your account and try again.',
          helpUrl: 'https://playit.gg/account'
        }
      case 'InvalidAgentKey':
        return { error: 'playit no longer recognizes this device. Set up public access again.' }
      case 'TunnelNotFound':
        return { error: 'The playit tunnel was removed. Try again to create a new one.' }
      case 'AgentNotFound':
      case 'InvalidAgentId':
        return { error: 'playit could not find the tunnel agent. Try again.' }
      case 'ClaimTimeout':
      case 'CodeExpired':
      case 'InvalidCode':
        return { error: 'The playit setup link expired. Try again.' }
      case 'UserRejected':
        return { error: 'The playit setup was declined. Try again when you are ready.' }
      case 'AddressPending':
        return {
          error: error.message,
          helpUrl: 'https://playit.gg/account/tunnels'
        }
      case 'RegionNotSupported':
      case 'RegionRequiresPlayitPremium':
        return { error: 'playit could not assign a free public address. Try again in a moment.' }
      case 'AccountPortLimitReached':
        return {
          error: 'Your playit account has reached its port limit. Remove an unused tunnel, then try again.',
          helpUrl: 'https://playit.gg/account/tunnels'
        }
      case 'PublicPortNotAvailable':
      case 'NoPortsAvailableOnIp':
      case 'PortAllocCurrentlyAssigned':
        return { error: 'playit could not assign a public port right now. Try again in a moment.' }
      case 'RequiresPlayitPremium':
        return {
          error: 'This playit tunnel needs Premium. Minecraft Java tunnels are free, so try again or check your playit plan.',
          helpUrl: 'https://playit.gg/pricing'
        }
      case 'AgentVersionTooOld':
        return { error: 'The playit agent is too old. Turn public access off and on again to update it.' }
      case 'InvalidTunnelConfig':
        return { error: 'playit rejected the tunnel configuration. Try again.' }
      case 'NoSecret':
        return { error: 'Public access needs a one-time playit setup. Try again.' }
      case 'NetworkError':
        return { error: 'Could not reach playit.gg. Check your internet connection and try again.' }
      case 'AuthRejected':
        return { error: 'playit rejected this device. Set up public access again.' }
      case 'UnsupportedPlatform':
      case 'AgentStartFailed':
      case 'HttpError':
      case 'BadResponse':
      case 'ApiError':
      case 'CreateFailed':
      case 'InvalidAgentResponse':
      case 'ClaimFailed':
        return { error: error.message }
      default:
        return { error: error.message.startsWith('playit') ? error.message : `playit: ${error.message}` }
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/fetch failed|ENOTFOUND|EAI_AGAIN|network|socket/i.test(message)) {
    return { error: 'Could not reach playit.gg. Check your internet connection and try again.' }
  }
  return { error: message }
}

export class PlayitTunnelManager {
  private readonly dir: string
  private readonly binaryPath: string
  private readonly secretPath: string
  private readonly configPath: string
  private config: PlayitConfig = { tunnels: {} }
  private statuses = new Map<string, PublicAccessStatus>()
  private claimJob?: ClaimJob
  private agent?: ChildProcess
  private agentSecret?: string
  private agentStarting?: Promise<void>
  private agentLog: string[] = []
  private binaryReady = false
  private disposed = false
  private queue: Promise<void> = Promise.resolve()
  private readonly tokens = new Map<string, number>()

  constructor() {
    this.dir = join(app.getPath('userData'), 'tunnel')
    this.binaryPath = join(this.dir, 'playitd.exe')
    this.secretPath = join(this.dir, 'playit-secret.txt')
    this.configPath = join(this.dir, 'playit.json')
  }

  async init(): Promise<void> {
    await ensureDir(this.dir)
    const loaded = await readJson<Partial<PlayitConfig> | null>(this.configPath, null)
    const tunnels: Record<string, StoredTunnel> = {}
    if (loaded?.tunnels && typeof loaded.tunnels === 'object') {
      for (const [serverId, value] of Object.entries(loaded.tunnels)) {
        if (!value || typeof value !== 'object') continue
        const entry = value as Partial<StoredTunnel>
        if (typeof entry.id !== 'string' || !entry.id) continue
        tunnels[serverId] = {
          id: entry.id,
          address: typeof entry.address === 'string' ? entry.address : '',
          port: typeof entry.port === 'number' ? entry.port : 25565,
          name: typeof entry.name === 'string' ? entry.name : ''
        }
      }
    }
    this.config = {
      secret: typeof loaded?.secret === 'string' && loaded.secret ? loaded.secret : undefined,
      agentId: typeof loaded?.agentId === 'string' && loaded.agentId ? loaded.agentId : undefined,
      tunnels
    }
  }

  status(serverId: string): PublicAccessStatus {
    const current = this.statuses.get(serverId)
    if (current) return { ...current }
    const stored = this.config.tunnels[serverId]
    return {
      state: 'idle',
      provider: 'playit.gg',
      address: stored?.address || undefined
    }
  }

  async enable(server: HostedServer): Promise<PublicAccessStatus> {
    if (process.platform !== 'win32') {
      this.setStatus(server.id, {
        state: 'error',
        provider: 'playit.gg',
        error: 'Public access is only available on Windows right now.'
      })
      return this.status(server.id)
    }
    const current = this.statuses.get(server.id)
    if (
      current &&
      (current.state === 'awaiting-claim' ||
        current.state === 'starting' ||
        current.state === 'online')
    ) {
      return { ...current }
    }
    if (!this.config.secret) {
      this.beginClaim(server)
      return this.status(server.id)
    }
    this.setStatus(server.id, {
      state: 'starting',
      provider: 'playit.gg',
      detail: 'Connecting to playit…'
    })
    void this.queueProvision(server)
    return this.status(server.id)
  }

  async resume(server: HostedServer): Promise<PublicAccessStatus> {
    if (process.platform !== 'win32') return this.status(server.id)
    if (!this.config.secret || !this.config.tunnels[server.id]) return this.status(server.id)
    const current = this.statuses.get(server.id)
    if (current && (current.state === 'starting' || current.state === 'online')) {
      return { ...current }
    }
    this.setStatus(server.id, {
      state: 'starting',
      provider: 'playit.gg',
      detail: 'Reconnecting public access…'
    })
    void this.queueProvision(server)
    return this.status(server.id)
  }

  async disable(serverId: string): Promise<PublicAccessStatus> {
    this.nextToken(serverId)
    if (this.claimJob?.serverId === serverId) this.claimJob.cancel = true
    const stored = this.config.tunnels[serverId]
    if (stored?.id && this.config.secret) {
      try {
        await this.setTunnelEnabled(stored.id, false, this.config.secret)
      } catch {
        // Best effort: deleting below also stops the tunnel.
      }
      try {
        await this.deleteTunnel(stored.id, this.config.secret)
      } catch {
        // A missing or already-deleted tunnel is fine.
      }
    }
    delete this.config.tunnels[serverId]
    await this.save()
    this.statuses.delete(serverId)
    if (Object.keys(this.config.tunnels).length === 0) this.stopAgent()
    return this.status(serverId)
  }

  async sync(server: HostedServer): Promise<void> {
    const stored = this.config.tunnels[server.id]
    if (!stored || !this.config.secret || stored.port === server.port) return
    stored.port = server.port
    await this.save()
    if (!stored.id) return
    try {
      await this.configureTunnel(stored.id, localFields(server), this.config.secret)
    } catch {
      // The next enable/resume reconciles the tunnel configuration.
    }
  }

  async remove(serverId: string): Promise<void> {
    await this.disable(serverId)
  }

  dispose(): void {
    this.disposed = true
    if (this.claimJob) this.claimJob.cancel = true
    this.stopAgent()
  }

  private beginClaim(server: HostedServer): void {
    if (this.claimJob) {
      this.claimJob.cancel = true
      if (this.claimJob.serverId !== server.id) {
        this.statuses.delete(this.claimJob.serverId)
      }
    }
    const code = randomBytes(5).toString('hex')
    const job: ClaimJob = { code, serverId: server.id, cancel: false }
    this.claimJob = job
    const claimUrl = CLAIM_URL(code)
    this.setStatus(server.id, {
      state: 'awaiting-claim',
      provider: 'playit.gg',
      claimUrl,
      detail: 'Finish the one-time playit setup in your browser.'
    })
    void shell.openExternal(claimUrl).catch(() => undefined)
    void this.watchClaim(server, job)
  }

  private async watchClaim(server: HostedServer, job: ClaimJob): Promise<void> {
    try {
      const deadline = Date.now() + CLAIM_TIMEOUT_MS
      let failures = 0
      let accepted = false
      while (!job.cancel && !this.disposed) {
        if (Date.now() > deadline) {
          throw new PlayitApiError('The playit setup timed out. Try again.', 'ClaimTimeout')
        }
        await sleep(2000)
        if (job.cancel || this.disposed) return
        try {
          const phase = await this.claimSetup(job.code)
          failures = 0
          if (phase === 'UserAccepted') {
            accepted = true
            break
          }
          if (phase === 'UserRejected') {
            throw new PlayitApiError('The playit setup was declined. Try again when you are ready.', 'UserRejected')
          }
        } catch (error) {
          if (
            error instanceof PlayitApiError &&
            (error.code === 'UserRejected' ||
              error.code === 'CodeExpired' ||
              error.code === 'InvalidCode')
          ) {
            throw error
          }
          failures += 1
          if (failures >= 5) throw error
        }
      }
      if (!accepted || job.cancel || this.disposed) return
      let secret = ''
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          secret = await this.claimExchange(job.code)
          break
        } catch (error) {
          if (attempt === 4) throw error
          await sleep(1500)
        }
      }
      if (!secret || job.cancel || this.disposed) return
      this.config.secret = secret
      this.config.agentId = undefined
      await this.save()
      this.setStatus(server.id, {
        state: 'starting',
        provider: 'playit.gg',
        detail: 'Connecting your playit account…'
      })
      await this.queueProvision(server)
    } catch (error) {
      if (job.cancel || this.disposed) return
      this.fail(server.id, error)
    } finally {
      if (this.claimJob === job) this.claimJob = undefined
    }
  }

  private queueProvision(server: HostedServer): Promise<void> {
    const token = this.nextToken(server.id)
    this.queue = this.queue
      .then(async () => {
        if (!this.isCurrent(server.id, token)) return
        await this.provision(server, token)
      })
      .catch(async (error) => {
        if (!this.isCurrent(server.id, token)) return
        if (error instanceof PlayitApiError && error.code === 'InvalidAgentKey') {
          this.config.secret = undefined
          this.config.agentId = undefined
          await this.save().catch(() => undefined)
        }
        this.fail(server.id, error)
      })
    return this.queue
  }

  private async provision(server: HostedServer, token: number): Promise<void> {
    if (!this.isCurrent(server.id, token)) return
    const secret = this.config.secret
    if (!secret) {
      throw new PlayitApiError('Public access needs a one-time playit setup.', 'NoSecret')
    }
    this.setStatus(server.id, {
      state: 'starting',
      provider: 'playit.gg',
      detail: 'Checking your playit account…'
    })
    let runData: AgentRunData
    try {
      runData = await this.agentRunData(secret)
    } catch (error) {
      if (error instanceof PlayitApiError && error.code === 'InvalidAgentKey') {
        this.config.secret = undefined
        this.config.agentId = undefined
        await this.save()
        throw new PlayitApiError(
          'playit no longer recognizes this device. Set up public access again.',
          'InvalidAgentKey'
        )
      }
      throw error
    }
    if (!this.isCurrent(server.id, token)) return
    const accountStatus = runData.permissions?.account_status
    if (accountStatus === 'email-not-verified') {
      throw new PlayitApiError('Verify your email address on playit.gg, then try again.', 'EmailNotVerified')
    }
    if (accountStatus === 'agent-over-limit' || accountStatus === 'agent-disabled' || accountStatus === 'banned') {
      throw new PlayitApiError(`playit account status: ${accountStatus}`, accountStatus)
    }
    const agentId = runData.agent_id
    if (!agentId) throw new PlayitApiError('playit did not return an agent id.', 'InvalidAgentResponse')
    this.config.agentId = agentId
    await this.save()
    if (!this.isCurrent(server.id, token)) return

    if (process.platform !== 'win32') {
      throw new PlayitApiError('Public access is only available on Windows right now.', 'UnsupportedPlatform')
    }
    await this.ensureBinary(server.id)
    if (!this.isCurrent(server.id, token)) return
    this.setStatus(server.id, {
      state: 'starting',
      provider: 'playit.gg',
      detail: 'Starting the playit tunnel…'
    })
    await this.ensureAgent(secret)
    if (!this.isCurrent(server.id, token)) return
    this.setStatus(server.id, {
      state: 'starting',
      provider: 'playit.gg',
      detail: 'Creating your public address…'
    })
    const tunnel = await this.ensureTunnel(server, agentId, secret)
    if (!this.isCurrent(server.id, token)) return
    this.config.tunnels[server.id] = tunnel
    await this.save()
    if (!this.isCurrent(server.id, token)) return
    this.setStatus(server.id, {
      state: 'online',
      provider: 'playit.gg',
      address: tunnel.address
    })
  }

  private async ensureBinary(serverId: string): Promise<void> {
    if (this.binaryReady) return
    const size = await fileSize(this.binaryPath)
    if (size === AGENT_SIZE) {
      const hash = await sha256File(this.binaryPath)
      if (hash === AGENT_SHA256) {
        this.binaryReady = true
        return
      }
    }
    this.setStatus(serverId, {
      state: 'starting',
      provider: 'playit.gg',
      detail: 'Downloading the playit agent (7.5 MB)…'
    })
    await downloadFile(AGENT_URL, this.binaryPath, {
      sha256: AGENT_SHA256,
      size: AGENT_SIZE,
      signal: AbortSignal.timeout(120_000)
    })
    this.binaryReady = true
  }

  private async ensureAgent(secret: string): Promise<void> {
    if (this.agentStarting) {
      await this.agentStarting.catch(() => undefined)
      if (this.agent && this.agent.exitCode === null && this.agentSecret === secret) return
    }
    if (this.agent && this.agent.exitCode === null) {
      if (this.agentSecret === secret) return
      this.stopAgent()
      await sleep(400)
    }
    this.agentStarting = this.startAgent(secret).finally(() => {
      this.agentStarting = undefined
    })
    return this.agentStarting
  }

  private async startAgent(secret: string): Promise<void> {
    await ensureDir(this.dir)
    await writeFile(this.secretPath, secret, 'utf8')
    const socketPath = `\\\\.\\pipe\\triad-playit-${randomBytes(4).toString('hex')}`
    const child = spawn(
      this.binaryPath,
      ['--secret-path', this.secretPath, '--socket-path', socketPath],
      {
        cwd: this.dir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
    this.agent = child
    this.agentSecret = secret
    this.agentLog = []
    const capture = (chunk: Buffer): void => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        this.agentLog.push(trimmed)
        if (this.agentLog.length > 30) this.agentLog.shift()
      }
    }
    child.stdout?.on('data', capture)
    child.stderr?.on('data', capture)
    child.on('exit', (code, signal) => {
      if (this.agent !== child) return
      this.agent = undefined
      this.agentSecret = undefined
      if (this.disposed) return
      const reason = this.agentLog.slice(-2).join(' ')
      for (const [serverId, status] of this.statuses) {
        if (status.state === 'online' || status.state === 'starting') {
          this.setStatus(serverId, {
            state: 'error',
            provider: 'playit.gg',
            error: `The playit agent stopped (${code ?? signal ?? 'unknown'}).${reason ? ` ${reason}` : ''}`
          })
        }
      }
    })
    await sleep(1800)
    if (child.exitCode !== null) {
      this.agent = undefined
      this.agentSecret = undefined
      const reason = this.agentLog.slice(-2).join(' ')
      throw new PlayitApiError(
        `The playit agent could not start.${reason ? ` ${reason}` : ''}`,
        'AgentStartFailed'
      )
    }
  }

  private stopAgent(): void {
    const child = this.agent
    this.agent = undefined
    this.agentSecret = undefined
    if (child && child.exitCode === null) child.kill()
  }

  private async ensureTunnel(
    server: HostedServer,
    agentId: string,
    secret: string
  ): Promise<StoredTunnel> {
    const name = tunnelName(server)
    const fields = localFields(server)
    const stored = this.config.tunnels[server.id]
    const tunnels = await this.listTunnels(secret)
    let tunnel = stored
      ? tunnels.find(
          (entry) => entry.id === stored.id && agentIdForTunnel(entry) === agentId
        )
      : undefined
    if (!tunnel) {
      tunnel = tunnels.find(
        (entry) =>
          entry.name === name &&
          entry.tunnel_type === 'minecraft-java' &&
          agentIdForTunnel(entry) === agentId
      )
    }
    if (tunnel) {
      if (tunnel.user_enabled === false) {
        await this.setTunnelEnabled(tunnel.id, true, secret)
      }
      try {
        await this.configureTunnel(tunnel.id, fields, secret)
      } catch (error) {
        if (!(error instanceof PlayitApiError && error.code === 'NothingToUpdate')) throw error
      }
      const address = extractAddress(tunnel)
      if (address) {
        return { id: tunnel.id, address, port: server.port, name: tunnel.name ?? name }
      }
      const ready = await this.waitForTunnel(tunnel.id, secret)
      if (ready) {
        return { id: tunnel.id, address: ready.address, port: server.port, name: ready.tunnel.name ?? name }
      }
      this.config.tunnels[server.id] = { id: tunnel.id, address: '', port: server.port, name }
      await this.save()
      throw new PlayitApiError(
        'playit created the tunnel but has not assigned a public address yet. Open playit.gg/account/tunnels and check it, then try again.',
        'AddressPending'
      )
    }

    const created = await this.createTunnel(server, agentId, name, fields, secret)
    this.config.tunnels[server.id] = {
      id: created.id,
      address: '',
      port: server.port,
      name
    }
    await this.save()
    const ready = await this.waitForTunnel(created.id, secret)
    if (!ready) {
      throw new PlayitApiError(
        'playit created the tunnel but has not assigned a public address yet. Try again in a moment.',
        'AddressPending'
      )
    }
    return {
      id: created.id,
      address: ready.address,
      port: server.port,
      name: ready.tunnel.name ?? name
    }
  }

  private async waitForTunnel(
    tunnelId: string,
    secret: string
  ): Promise<{ tunnel: AccountTunnel; address: string } | null> {
    for (let attempt = 0; attempt < ADDRESS_WAIT_ATTEMPTS; attempt++) {
      await sleep(1000)
      if (this.disposed) return null
      let tunnels: AccountTunnel[]
      try {
        tunnels = await this.listTunnels(secret)
      } catch {
        continue
      }
      const tunnel = tunnels.find((entry) => entry.id === tunnelId)
      if (!tunnel) continue
      if (tunnel.user_enabled === false) {
        try {
          await this.setTunnelEnabled(tunnelId, true, secret)
        } catch {
          // The next poll retries.
        }
      }
      const address = extractAddress(tunnel)
      if (address) return { tunnel, address }
    }
    return null
  }

  private async createTunnel(
    server: HostedServer,
    agentId: string,
    name: string,
    fields: Array<{ name: string; value: string }>,
    secret: string
  ): Promise<{ id: string }> {
    const created = await this.api<{ id?: string }>(
      '/v1/tunnels/create',
      {
        name,
        ports: { type: 'tunnel-type', details: 'minecraft-java' },
        origin: {
          type: 'agent',
          data: {
            agent_id: agentId,
            config: { fields }
          }
        },
        enabled: true,
        alloc: {
          type: 'region',
          details: { region: 'global', port: null }
        }
      },
      secret
    )
    if (!created?.id) {
      throw new PlayitApiError('playit did not return a tunnel id.', 'CreateFailed')
    }
    return { id: created.id }
  }

  private async configureTunnel(
    tunnelId: string,
    fields: Array<{ name: string; value: string }>,
    secret: string
  ): Promise<void> {
    await this.api(
      '/v1/tunnels/config',
      {
        tunnel_id: tunnelId,
        new_agent_id: null,
        new_config: { fields }
      },
      secret
    )
  }

  private async setTunnelEnabled(tunnelId: string, enabled: boolean, secret: string): Promise<void> {
    await this.api('/tunnels/enable', { tunnel_id: tunnelId, enabled }, secret)
  }

  private async deleteTunnel(tunnelId: string, secret: string): Promise<void> {
    await this.api('/tunnels/delete', { tunnel_id: tunnelId }, secret)
  }

  private async listTunnels(secret: string): Promise<AccountTunnel[]> {
    const data = await this.api<{ tunnels?: AccountTunnel[] }>('/v1/tunnels/list', {}, secret)
    return Array.isArray(data?.tunnels) ? data.tunnels : []
  }

  private async agentRunData(secret: string): Promise<AgentRunData> {
    const data = await this.api<AgentRunData>('/v1/agents/rundata', {}, secret)
    if (!data?.agent_id) {
      throw new PlayitApiError('playit did not return an agent id.', 'InvalidAgentResponse')
    }
    return data
  }

  private async claimSetup(code: string): Promise<string> {
    const phase = await this.api<string>('/claim/setup', {
      code,
      agent_type: 'self-managed',
      version: `playit ${AGENT_VERSION}`
    })
    return String(phase)
  }

  private async claimExchange(code: string): Promise<string> {
    const data = await this.api<{ secret_key?: string }>('/claim/exchange', { code })
    if (!data?.secret_key) {
      throw new PlayitApiError('playit did not return an agent key.', 'ClaimFailed')
    }
    return data.secret_key
  }

  private async api<T>(path: string, body: unknown, secret?: string): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
    if (secret) headers.Authorization = `agent-key ${secret}`
    let res: Response
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(20_000)
      })
    } catch (error) {
      throw new PlayitApiError(
        `Could not reach playit.gg: ${error instanceof Error ? error.message : String(error)}`,
        'NetworkError'
      )
    }
    const text = await res.text()
    if (!text.trim()) {
      if (res.ok) return undefined as T
      throw new PlayitApiError(`playit request failed (${res.status}).`, 'HttpError')
    }
    let payload: ApiEnvelope<T> | null = null
    try {
      payload = JSON.parse(text) as ApiEnvelope<T>
    } catch {
      payload = null
    }
    if (payload && typeof payload === 'object' && 'status' in payload && payload.status !== 'success') {
      const data = payload.data
      if (typeof data === 'string') throw new PlayitApiError(data, data)
      if (data && typeof data === 'object') {
        const record = data as Record<string, unknown>
        const raw =
          typeof record.message === 'string'
            ? record.message
            : typeof record.error === 'string'
              ? record.error
              : ''
        if (raw) throw new PlayitApiError(raw, raw)
      }
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new PlayitApiError('playit rejected the request. Try setting up public access again.', 'AuthRejected')
      }
      throw new PlayitApiError(`playit request failed (${res.status}).`, 'HttpError')
    }
    if (!payload || typeof payload !== 'object' || !('status' in payload)) {
      throw new PlayitApiError('playit returned an unexpected response.', 'BadResponse')
    }
    if (payload.status === 'success') return payload.data as T
    throw new PlayitApiError('playit could not complete the request.', 'ApiError')
  }

  private save(): Promise<void> {
    return writeJson(this.configPath, this.config)
  }

  private setStatus(serverId: string, status: PublicAccessStatus): void {
    this.statuses.set(serverId, status)
  }

  private fail(serverId: string, error: unknown): void {
    this.setStatus(serverId, {
      state: 'error',
      provider: 'playit.gg',
      ...describeError(error)
    })
  }

  private nextToken(serverId: string): number {
    const token = (this.tokens.get(serverId) ?? 0) + 1
    this.tokens.set(serverId, token)
    return token
  }

  private isCurrent(serverId: string, token: number): boolean {
    return !this.disposed && this.tokens.get(serverId) === token
  }
}
