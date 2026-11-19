import { join } from 'node:path'
import type { AutoDownloadStatus, Instance } from '@shared/types'
import type { ContentManager } from './content'
import type { Store } from './store'
import type { TaskManager } from './tasks'
import { events } from './events'
import { ensureInstanceVersion } from './versions'
import { pathExists, readJson } from './util'

const CHECK_INTERVAL = 6 * 60 * 60_000

export class AutoDownloader {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private lastRun?: number
  private nextRun?: number
  private message = 'Ready to check your instances.'

  constructor(
    private store: Store,
    private tasks: TaskManager,
    private content: ContentManager
  ) {}

  start(): void {
    if (this.timer) return
    this.nextRun = Date.now() + 10_000
    this.timer = setInterval(() => void this.run(), CHECK_INTERVAL)
    setTimeout(() => void this.run(), 10_000)
    this.emit()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  status(): AutoDownloadStatus {
    return {
      running: this.running,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      message: this.message,
      autoDownload: this.store.settings.autoDownload,
      autoUpdateMods: this.store.settings.autoUpdateMods
    }
  }

  private emit(): void {
    events.dataChanged('instances')
  }

  async run(): Promise<AutoDownloadStatus> {
    if (this.running) return this.status()
    if (!this.store.settings.autoDownload && !this.store.settings.autoUpdateMods) {
      this.message = 'Auto downloads are turned off.'
      this.nextRun = Date.now() + CHECK_INTERVAL
      this.emit()
      return this.status()
    }
    if (this.tasks.list().some((task) => task.status === 'running')) {
      this.message = 'Waiting for active downloads to finish.'
      this.nextRun = Date.now() + 5 * 60_000
      this.emit()
      return this.status()
    }

    this.running = true
    this.message = 'Checking instances…'
    this.emit()
    let prepared = 0
    let updated = 0
    try {
      for (const instance of this.store.data.instances) {
        if (!this.store.settings.autoDownload) break
        const missing = await this.needsGameFiles(instance)
        if (!missing) continue
        const task = this.tasks.create(`Auto-preparing ${instance.name}`, 'install', 'Downloading missing files')
        await ensureInstanceVersion(
          instance,
          this.store,
          this.store.settings.javaPath || instance.javaPath || undefined,
          (progress, stage) => task.update(progress, stage),
          task.signal
        )
          .then(() => {
            task.done({ instanceId: instance.id })
            prepared++
          })
          .catch((error) => task.fail(error))
      }

      if (this.store.settings.autoUpdateMods) {
        for (const instance of this.store.data.instances) {
          if (instance.loader === 'vanilla') continue
          const updates = await this.content.checkUpdates(instance.id).catch(() => [])
          for (const update of updates) {
            this.content.installProject(instance.id, update.projectId, update.latestId)
            updated++
          }
        }
      }

      this.lastRun = Date.now()
      this.message =
        prepared || updated
          ? `Prepared ${prepared} instance${prepared === 1 ? '' : 's'} and queued ${updated} mod update${updated === 1 ? '' : 's'}.`
          : 'Everything is ready. Nothing needed downloading.'
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Auto download check failed.'
    } finally {
      this.running = false
      this.nextRun = Date.now() + CHECK_INTERVAL
      this.emit()
    }
    return this.status()
  }

  private async needsGameFiles(instance: Instance): Promise<boolean> {
    const marker = await readJson<{ versionId?: string }>(
      join(this.store.metaDir(instance.id), 'install.json'),
      {}
    )
    const versionId = marker.versionId || instance.versionId
    if (!versionId) return true
    return !(await pathExists(
      join(this.store.sharedDir, 'versions', versionId, `${versionId}.json`)
    ))
  }
}
