import { app, dialog, type BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater } from 'electron-updater'
import type { UpdaterStatus } from '@shared/types'
import { events } from './events'

const CHECK_INTERVAL = 60 * 60_000
const STARTUP_DELAY = 4_000

interface UpdateFeedConfig {
  url?: string
}

function feedPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'update-feed.json')
    : join(app.getAppPath(), 'resources', 'update-feed.json')
}

function normalizeFeedUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    const local =
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1')
    if (url.protocol !== 'https:' && !local) return null
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

function readFeedConfig(): UpdateFeedConfig {
  try {
    return JSON.parse(readFileSync(feedPath(), 'utf8')) as UpdateFeedConfig
  } catch {
    return {}
  }
}

function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/\s+/g, ' ').trim().slice(0, 240) || 'The update check failed.'
}

export class Updater {
  private statusState: UpdaterStatus = {
    phase: 'disabled',
    message: 'Updates are not configured for this build.',
    feedConfigured: false
  }
  private startTimeout: NodeJS.Timeout | null = null
  private timer: NodeJS.Timeout | null = null
  private started = false
  private prompting = false
  private announcedVersion?: string
  private promptedVersion?: string
  private lastProgressAt = 0

  constructor(private getWindow: () => BrowserWindow | null) {
    autoUpdater.on('checking-for-update', () => {
      this.setStatus({
        phase: 'checking',
        message: 'Checking for a new launcher build…',
        feedConfigured: true
      })
    })
    autoUpdater.on('update-not-available', () => {
      this.setStatus({
        phase: 'idle',
        message: 'Triad is up to date.',
        checkedAt: Date.now(),
        feedConfigured: true
      })
    })
    autoUpdater.on('update-available', (info) => {
      this.setStatus({
        phase: 'available',
        message: `Triad ${info.version} is available. Press Update to download it.`,
        version: info.version,
        percent: 0,
        feedConfigured: true
      })
      if (this.announcedVersion !== info.version) {
        this.announcedVersion = info.version
        events.toast({
          title: `Triad ${info.version} is available`,
          description: 'Open the update banner to download and install it.',
          variant: 'default'
        })
      }
    })
    autoUpdater.on('download-progress', (progress) => {
      const now = Date.now()
      const percent = Math.max(0, Math.min(100, Math.round(progress.percent)))
      if (now - this.lastProgressAt < 250 && percent < 100) return
      this.lastProgressAt = now
      this.setStatus({
        phase: 'downloading',
        message: `Downloading Triad ${this.statusState.version ?? 'update'}… ${percent}%`,
        version: this.statusState.version,
        percent,
        feedConfigured: true
      })
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.setStatus({
        phase: 'ready',
        message: `Triad ${info.version} is ready to install.`,
        version: info.version,
        percent: 100,
        checkedAt: Date.now(),
        feedConfigured: true
      })
      void this.promptToInstall(info.version)
    })
    autoUpdater.on('error', (error) => {
      this.setStatus({
        phase: 'error',
        message: friendlyError(error),
        checkedAt: Date.now(),
        feedConfigured: this.statusState.feedConfigured
      })
    })
  }

  start(): void {
    if (this.started) return
    this.started = true

    if (!app.isPackaged) {
      this.setStatus({
        phase: 'disabled',
        message: 'Updates are available in the installed build of Triad.',
        feedConfigured: false
      })
      return
    }

    const feedUrl = normalizeFeedUrl(readFeedConfig().url)
    if (!feedUrl) {
      this.setStatus({
        phase: 'disabled',
        message: 'This build has no public update feed configured.',
        feedConfigured: false
      })
      return
    }

    try {
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.autoRunAppAfterInstall = true
      autoUpdater.allowPrerelease = false
      autoUpdater.allowDowngrade = false
      autoUpdater.disableWebInstaller = true
      // A full installer is safer than trying to reuse a blockmap from the
      // "latest" GitHub release URL, where the previous release's blockmap is not
      // guaranteed to still be addressable.
      autoUpdater.disableDifferentialDownload = true
      autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
      this.setStatus({
        phase: 'idle',
        message: 'Updates are checked automatically.',
        feedConfigured: true
      })
    } catch (error) {
      this.setStatus({
        phase: 'error',
        message: friendlyError(error),
        feedConfigured: false
      })
      return
    }

    this.startTimeout = setTimeout(() => void this.check(), STARTUP_DELAY)
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL)
  }

  stop(): void {
    if (this.startTimeout) clearTimeout(this.startTimeout)
    if (this.timer) clearInterval(this.timer)
    this.startTimeout = null
    this.timer = null
    this.started = false
  }

  status(): UpdaterStatus {
    return { ...this.statusState }
  }

  async check(): Promise<UpdaterStatus> {
    if (!this.statusState.feedConfigured) return this.status()
    if (
      this.statusState.phase === 'checking' ||
      this.statusState.phase === 'available' ||
      this.statusState.phase === 'downloading' ||
      this.statusState.phase === 'ready'
    ) {
      return this.status()
    }

    this.setStatus({
      phase: 'checking',
      message: 'Checking for a new launcher build…',
      feedConfigured: true
    })

    try {
      await autoUpdater.checkForUpdates()
      if (this.status().phase === 'checking') {
        this.setStatus({
          phase: 'idle',
          message: 'Triad is up to date.',
          checkedAt: Date.now(),
          feedConfigured: true
        })
      }
    } catch (error) {
      this.setStatus({
        phase: 'error',
        message: friendlyError(error),
        checkedAt: Date.now(),
        feedConfigured: true
      })
    }
    return this.status()
  }

  async download(): Promise<UpdaterStatus> {
    if (this.statusState.phase === 'ready' || this.statusState.phase === 'downloading') {
      return this.status()
    }
    if (this.statusState.phase !== 'available') {
      throw new Error('There is no update waiting to download.')
    }

    this.setStatus({
      phase: 'downloading',
      message: `Downloading Triad ${this.statusState.version ?? 'update'}…`,
      percent: 0,
      feedConfigured: true
    })

    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.setStatus({
        phase: 'error',
        message: friendlyError(error),
        checkedAt: Date.now(),
        feedConfigured: true
      })
    }
    return this.status()
  }

  async install(): Promise<void> {
    if (this.statusState.phase !== 'ready') {
      throw new Error('The update has not finished downloading yet.')
    }
    autoUpdater.quitAndInstall(false, true)
  }

  private async promptToInstall(version: string): Promise<void> {
    if (this.prompting || this.promptedVersion === version) return
    this.prompting = true
    this.promptedVersion = version

    try {
      const window = this.getWindow()
      const options = {
        type: 'info' as const,
        title: 'Triad update ready',
        message: `Triad ${version} is ready to install.`,
        detail:
          'Restart Triad to finish the update. Patch notes will appear when it reopens. Your accounts, instances, mods, worlds and settings will stay in place.',
        buttons: ['Restart and install', 'Later'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      }
      const result =
        window && !window.isDestroyed()
          ? await dialog.showMessageBox(window, options)
          : await dialog.showMessageBox(options)
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true)
      }
    } catch {
      // Keep the ready state so Settings can still offer the restart action.
    } finally {
      this.prompting = false
    }
  }

  private setStatus(patch: Partial<UpdaterStatus>): void {
    this.statusState = { ...this.statusState, ...patch }
    events.updater(this.status())
  }
}
