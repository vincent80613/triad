import { app } from 'electron'
import { join } from 'node:path'
import type { AppData, Instance, ModRecord, Settings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { ensureDir, readJson, writeJson } from './util'

export class Store {
  readonly file: string
  readonly backupFile: string
  readonly instancesRoot: string
  readonly sharedDir: string
  data: AppData
  private saveTimer: NodeJS.Timeout | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor() {
    const userData = app.getPath('userData')
    this.file = join(userData, 'triad.json')
    this.backupFile = join(userData, 'triad.backup.json')
    this.instancesRoot = join(userData, 'instances')
    this.sharedDir = join(userData, 'minecraft')
    this.data = {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      instances: [],
      activeInstanceId: null,
      account: null,
      stats: { days: {}, sessions: [] },
      mods: {}
    }
  }

  async init(): Promise<void> {
    await ensureDir(this.instancesRoot)
    await ensureDir(this.sharedDir)
    let loaded = await readJson<Partial<AppData> | null>(this.file, null)
    let restored = false
    if (!loaded || typeof loaded !== 'object' || typeof loaded.version !== 'number') {
      const backup = await readJson<Partial<AppData> | null>(this.backupFile, null)
      if (backup && typeof backup === 'object' && typeof backup.version === 'number') {
        loaded = backup
        restored = true
      }
    }
    if (loaded && typeof loaded === 'object') {
      this.data = {
        version: 1,
        settings: { ...DEFAULT_SETTINGS, ...(loaded.settings ?? {}) },
        instances: Array.isArray(loaded.instances) ? loaded.instances : [],
        activeInstanceId: loaded.activeInstanceId ?? null,
        account: loaded.account ?? null,
        stats: {
          days: loaded.stats?.days ?? {},
          sessions: Array.isArray(loaded.stats?.sessions) ? loaded.stats.sessions : []
        },
        mods: loaded.mods && typeof loaded.mods === 'object' ? loaded.mods : {},
        lastSeenVersion: typeof loaded.lastSeenVersion === 'string' ? loaded.lastSeenVersion : undefined
      }
    }
    if (this.data.settings.clientId === '00000000-402b-4cd3-a82b-c45ab2f1d3f7') {
      this.data.settings.clientId = DEFAULT_SETTINGS.clientId
    }
    if (!this.data.activeInstanceId && this.data.instances.length) {
      this.data.activeInstanceId = this.data.instances[0].id
    }
    // Seed the backup for existing profiles too, so a later corrupt write can be recovered.
    if (restored || (loaded && typeof loaded === 'object')) this.save(true)
  }

  private persist(): void {
    const snapshot = this.data
    this.writeChain = this.writeChain
      .then(() => writeJson(this.file, snapshot))
      .then(() => writeJson(this.backupFile, snapshot))
      .catch(() => undefined)
  }

  save(immediate = false): void {
    if (immediate) {
      if (this.saveTimer) clearTimeout(this.saveTimer)
      this.saveTimer = null
      this.persist()
      return
    }
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.persist()
    }, 200)
  }

  get settings(): Settings {
    return this.data.settings
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.data.settings = { ...this.data.settings, ...patch }
    this.save()
    return this.data.settings
  }

  markVersionSeen(version: string): void {
    this.data.lastSeenVersion = version
    this.save(true)
  }

  getInstance(id: string): Instance | undefined {
    return this.data.instances.find((instance) => instance.id === id)
  }

  requireInstance(id: string): Instance {
    const instance = this.getInstance(id)
    if (!instance) throw new Error('Instance not found')
    return instance
  }

  instanceDir(id: string): string {
    return join(this.instancesRoot, id)
  }

  minecraftDir(id: string): string {
    return join(this.instanceDir(id), 'minecraft')
  }

  metaDir(id: string): string {
    return join(this.instanceDir(id), '.triad')
  }

  modRecords(id: string): Record<string, ModRecord> {
    if (!this.data.mods[id]) this.data.mods[id] = {}
    return this.data.mods[id]
  }

  setModRecords(id: string, records: Record<string, ModRecord>): void {
    this.data.mods[id] = records
    this.save()
  }

  addInstance(instance: Instance): Instance {
    this.data.instances.push(instance)
    if (!this.data.activeInstanceId) this.data.activeInstanceId = instance.id
    this.save()
    return instance
  }

  removeInstance(id: string): void {
    this.data.instances = this.data.instances.filter((instance) => instance.id !== id)
    if (this.data.activeInstanceId === id) {
      this.data.activeInstanceId = this.data.instances[0]?.id ?? null
    }
    delete this.data.mods[id]
    this.data.stats.sessions = this.data.stats.sessions.filter((s) => s.instanceId !== id)
    this.save()
  }

  recordSession(instanceId: string, startedAt: number, durationMs: number, crashed: boolean): void {
    const day = new Date(startedAt).toISOString().slice(0, 10)
    this.data.stats.days[day] = (this.data.stats.days[day] ?? 0) + durationMs
    this.data.stats.sessions.unshift({ instanceId, startedAt, durationMs, crashed })
    this.data.stats.sessions = this.data.stats.sessions.slice(0, 80)
    const instance = this.getInstance(instanceId)
    if (instance) {
      instance.playtimeMs = (instance.playtimeMs ?? 0) + durationMs
      instance.lastPlayed = startedAt
    }
    this.save()
  }

  totalPlaytime(instanceId?: string): number {
    return this.data.instances
      .filter((instance) => !instanceId || instance.id === instanceId)
      .reduce((total, instance) => total + (instance.playtimeMs ?? 0), 0)
  }
}
