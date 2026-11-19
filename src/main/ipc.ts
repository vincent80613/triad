import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { cp, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'
import type {
  Account,
  AppInfo,
  CreateInstanceInput,
  Instance,
  LoaderType,
  ModUpdate,
  ModrinthSearchParams,
  ProjectType,
  ServerEntry,
  Settings,
  WallpaperMode,
  World,
  LanguageCode,
  UiDensity
} from '@shared/types'
import { explainAuthError } from '@shared/authErrors'
import type { AutoDownloader } from './auto'
import type { Updater } from './updater'
import { applyMinecraftSkin } from './accountSkin'
import { clearSkin, loadSkins, saveSkin } from './skins'
import { exportTriadPack, importTriadPack } from './transfer'
import { cancelLogin, offlineUuid, startMicrosoftLogin, validateOfflineName } from './auth'
import { ContentManager } from './content'
import { events } from './events'
import { detectJava, installJavaRuntime } from './java'
import { Launcher } from './launch'
import { getProject, getProjectVersions, searchProjects } from './modrinth'
import type { Store } from './store'
import type { TaskManager } from './tasks'
import { listVersions, loaderVersions } from './versions'
import { uid } from './util'

export interface Services {
  store: Store
  tasks: TaskManager
  content: ContentManager
  launcher: Launcher
  auto: AutoDownloader
  updater: Updater
  getWindow: () => BrowserWindow | null
}

const LOADERS: LoaderType[] = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge']
const PROJECT_TYPES: ProjectType[] = ['mod', 'modpack', 'resourcepack', 'shader']

function clamp(value: number, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function sanitizeSettings(patch: Partial<Settings>): Partial<Settings> {
  const next: Partial<Settings> = {}
  if (typeof patch.theme === 'string') next.theme = patch.theme.slice(0, 40)
  if (patch.accent === null || /^#[0-9a-fA-F]{6}$/.test(String(patch.accent))) {
    next.accent = patch.accent ?? null
  }
  if (patch.glassBlur !== undefined) next.glassBlur = clamp(patch.glassBlur, 0, 60, 24)
  if (patch.glassTint !== undefined) next.glassTint = clamp(patch.glassTint, 25, 150, 100)
  if (patch.radius !== undefined) next.radius = clamp(patch.radius, 8, 32, 18)
  if (patch.memoryMb !== undefined) next.memoryMb = clamp(patch.memoryMb, 1024, 32768, 4096)
  if (patch.wallpaper === 'aurora' || patch.wallpaper === 'system') next.wallpaper = patch.wallpaper
  if (typeof patch.motion === 'boolean') next.motion = patch.motion
  if (typeof patch.closeOnLaunch === 'boolean') next.closeOnLaunch = patch.closeOnLaunch
  if (typeof patch.showSnapshots === 'boolean') next.showSnapshots = patch.showSnapshots
  if (typeof patch.memorySaver === 'boolean') next.memorySaver = patch.memorySaver
  if (typeof patch.javaPath === 'string') next.javaPath = patch.javaPath.trim().slice(0, 500)
  if (patch.uiDensity === 'compact' || patch.uiDensity === 'comfortable' || patch.uiDensity === 'spacious') {
    next.uiDensity = patch.uiDensity as UiDensity
  }
  if (patch.fontScale !== undefined) next.fontScale = clamp(patch.fontScale, 80, 140, 100)
  if (typeof patch.sidebarCompact === 'boolean') next.sidebarCompact = patch.sidebarCompact
  if (typeof patch.showCardPlaytime === 'boolean') next.showCardPlaytime = patch.showCardPlaytime
  if (typeof patch.confirmDelete === 'boolean') next.confirmDelete = patch.confirmDelete
  if (typeof patch.autoDownload === 'boolean') next.autoDownload = patch.autoDownload
  if (typeof patch.autoUpdateMods === 'boolean') next.autoUpdateMods = patch.autoUpdateMods
  if (typeof patch.launchOnStartup === 'boolean') next.launchOnStartup = patch.launchOnStartup
  if (typeof patch.discordPresence === 'boolean') next.discordPresence = patch.discordPresence
  if (typeof patch.discordHideServerAddress === 'boolean') {
    next.discordHideServerAddress = patch.discordHideServerAddress
  }
  if (
    patch.language === 'en' ||
    patch.language === 'nl' ||
    patch.language === 'de' ||
    patch.language === 'fr' ||
    patch.language === 'es' ||
    patch.language === 'pt'
  ) {
    next.language = patch.language as LanguageCode
  }
  if (typeof patch.clientId === 'string') {
    const clientId = patch.clientId.trim()
    if (
      /^[0-9a-f]{16}$/i.test(clientId) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)
    ) {
      next.clientId = clientId
    }
  }
  return next
}

function normalizeServer(input: Partial<ServerEntry> | undefined, fallbackName = ''): ServerEntry {
  const raw = String(input?.address ?? '')
    .trim()
    .replace(/^minecraft:\/\//i, '')
    .replace(/\/+$/, '')
  if (!raw || raw.length > 260) throw new Error('Enter a valid server address.')
  if (/[\s/\\]/.test(raw)) throw new Error('Server addresses cannot contain spaces or slashes.')
  const host = raw.startsWith('[') ? raw.slice(1, raw.indexOf(']')) : raw.split(':')[0]
  if (!host || !/^[a-z0-9._:-]+$/i.test(host)) {
    throw new Error('That does not look like a server address.')
  }
  const portMatch = raw.match(/:([0-9]{1,5})$/)
  if (portMatch) {
    const port = Number(portMatch[1])
    if (port < 1 || port > 65535) throw new Error('Server ports must be between 1 and 65535.')
  }
  const name = String(input?.name ?? '').trim().slice(0, 48) || fallbackName || raw
  return { name, address: raw }
}

function applyWallpaper(services: Services, mode: WallpaperMode): void {
  const window = services.getWindow()
  if (!window || process.platform !== 'win32') return
  try {
    window.setBackgroundMaterial(mode === 'system' ? 'acrylic' : 'none')
  } catch {
    // Windows 10 or older builds do not support backdrop materials.
  }
}

export function registerIpc(services: Services): void {
  const { store, tasks, content, launcher, auto, updater } = services

  ipcMain.handle('app:info', async (): Promise<AppInfo> => {
    const build = Number(os.release().split('.')[2] ?? 0)
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      userData: app.getPath('userData'),
      instancesDir: store.instancesRoot,
      isWindows11: process.platform === 'win32' && build >= 22000,
      lastSeenVersion: store.data.lastSeenVersion
    }
  })

  ipcMain.handle('app:markVersionSeen', async () => {
    store.markVersionSeen(app.getVersion())
  })

  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only web links can be opened.')
    await shell.openExternal(url)
  })

  ipcMain.handle('app:openPath', async (_event, path: string) => {
    await shell.openPath(path)
  })

  ipcMain.handle('app:setWallpaper', async (_event, mode: WallpaperMode) => {
    if (mode !== 'aurora' && mode !== 'system') return
    store.updateSettings({ wallpaper: mode })
    applyWallpaper(services, mode)
    events.dataChanged('settings')
  })

  ipcMain.handle('app:relaunch', async () => {
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle('app:stats', async () => store.data.stats)

  ipcMain.on('window:minimize', () => services.getWindow()?.minimize())
  ipcMain.on('window:toggleMaximize', () => {
    const window = services.getWindow()
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.on('window:close', () => services.getWindow()?.close())
  ipcMain.handle('window:isMaximized', async () => services.getWindow()?.isMaximized() ?? false)

  ipcMain.handle('settings:get', async () => store.settings)
  ipcMain.handle('settings:update', async (_event, patch: Partial<Settings>) => {
    const settings = store.updateSettings(sanitizeSettings(patch))
    if (patch.wallpaper) applyWallpaper(services, settings.wallpaper)
    if (patch.launchOnStartup !== undefined) {
      app.setLoginItemSettings({ openAtLogin: settings.launchOnStartup })
    }
    if (patch.discordPresence !== undefined) {
      launcher.setPresenceEnabled(settings.discordPresence)
    }
    if (patch.discordHideServerAddress !== undefined) {
      launcher.refreshPresence()
    }
    events.dataChanged('settings')
    return settings
  })

  ipcMain.handle('instances:list', async () => store.data.instances)

  ipcMain.handle(
    'instances:create',
    async (_event, input: CreateInstanceInput) => {
      if (!LOADERS.includes(input.loader)) throw new Error('Unknown mod loader.')
      if (!input.mcVersion) throw new Error('Choose a Minecraft version.')
      return content.createInstance({
        name: String(input.name ?? ''),
        icon: String(input.icon ?? '🌿').slice(0, 8),
        tint: String(input.tint ?? '#8f7bff'),
        mcVersion: String(input.mcVersion),
        loader: input.loader,
        loaderVersion: input.loaderVersion ? String(input.loaderVersion) : undefined,
        memoryMb: input.memoryMb
      })
    }
  )

  ipcMain.handle('instances:addServer', async (_event, id: string, server: ServerEntry) => {
    const instance = store.requireInstance(id)
    const safe = normalizeServer(server)
    const existing = instance.servers ?? []
    if (existing.some((entry) => entry.address.toLowerCase() === safe.address.toLowerCase())) {
      throw new Error('That server is already saved to this instance.')
    }
    instance.servers = [...existing, safe].slice(0, 50)
    store.save()
    events.dataChanged('instances')
    return instance
  })

  ipcMain.handle('instances:removeServer', async (_event, id: string, address: string) => {
    const instance = store.requireInstance(id)
    instance.servers = (instance.servers ?? []).filter(
      (entry) => entry.address.toLowerCase() !== String(address).toLowerCase()
    )
    store.save()
    events.dataChanged('instances')
    return instance
  })

  ipcMain.handle('instances:update', async (_event, id: string, patch: Partial<Instance>) => {
    const instance = store.requireInstance(id)
    if (typeof patch.name === 'string') {
      const name = patch.name.trim()
      if (!name) throw new Error('Instance name cannot be empty.')
      instance.name = name.slice(0, 48)
    }
    if (typeof patch.icon === 'string') instance.icon = patch.icon.slice(0, 8)
    if (typeof patch.tint === 'string' && /^#[0-9a-fA-F]{6}$/.test(patch.tint)) {
      instance.tint = patch.tint
    }
    if (patch.memoryMb !== undefined) instance.memoryMb = clamp(patch.memoryMb, 1024, 32768, 4096)
    if (typeof patch.javaPath === 'string') instance.javaPath = patch.javaPath.trim().slice(0, 500)
    if (typeof patch.jvmArgs === 'string') instance.jvmArgs = patch.jvmArgs.slice(0, 1000)
    if (typeof patch.notes === 'string') instance.notes = patch.notes.slice(0, 2000)
    if (Array.isArray(patch.tags)) {
      instance.tags = [...new Set(patch.tags.map((tag) => String(tag).trim()).filter(Boolean))]
        .slice(0, 8)
        .map((tag) => tag.slice(0, 24))
    }
    if (typeof patch.group === 'string') instance.group = patch.group.trim().slice(0, 32) || undefined
    if (typeof patch.favorite === 'boolean') instance.favorite = patch.favorite
    store.save()
    events.dataChanged('instances')
    return instance
  })

  ipcMain.handle('instances:remove', async (_event, id: string) => {
    store.requireInstance(id)
    if (launcher.isRunning() && launcher.getState().instanceId === id) launcher.stop()
    await rm(store.instanceDir(id), { recursive: true, force: true })
    store.removeInstance(id)
    events.dataChanged('instances')
  })

  ipcMain.handle('instances:duplicate', async (_event, id: string) => {
    const source = store.requireInstance(id)
    const names = new Set(store.data.instances.map((instance) => instance.name))
    let name = `${source.name} copy`
    let index = 2
    while (names.has(name)) {
      name = `${source.name} copy ${index++}`
    }
    const copy: Instance = {
      ...source,
      id: uid('inst_'),
      name,
      created: Date.now(),
      lastPlayed: undefined,
      playtimeMs: 0
    }
    await cp(store.instanceDir(id), store.instanceDir(copy.id), {
      recursive: true,
      force: true,
      errorOnExist: false
    }).catch(async () => {
      await rm(store.instanceDir(copy.id), { recursive: true, force: true })
      throw new Error('Could not copy the instance folder.')
    })
    store.addInstance(copy)
    store.data.mods[copy.id] = { ...(store.data.mods[id] ?? {}) }
    store.save()
    events.dataChanged('instances')
    return copy
  })

  ipcMain.handle('instances:reorder', async (_event, ids: string[]) => {
    const known = new Set(store.data.instances.map((instance) => instance.id))
    const ordered = ids.map(String).filter((id) => known.has(id))
    const seen = new Set(ordered)
    const rest = store.data.instances.filter((instance) => !seen.has(instance.id))
    const byId = new Map(store.data.instances.map((instance) => [instance.id, instance]))
    store.data.instances = [...ordered.map((id) => byId.get(id)!).filter(Boolean), ...rest]
    store.save()
    events.dataChanged('instances')
    return store.data.instances
  })

  ipcMain.handle('instances:health', async (_event, id: string) => content.health(id))
  ipcMain.handle('instances:repair', async (_event, id: string) => content.repair(id))

  ipcMain.handle('instances:export', async (_event, id: string) => {
    const instance = store.requireInstance(id)
    const result = await dialog.showSaveDialog({
      title: 'Export Triad instance',
      defaultPath: join(app.getPath('documents'), `${instance.name.replace(/[\\/:*?"<>|]/g, '-')}.triadpack`),
      filters: [{ name: 'Triad instance', extensions: ['triadpack'] }]
    })
    if (result.canceled || !result.filePath) return null
    await exportTriadPack(store, id, result.filePath)
    events.toast({ title: 'Instance exported', description: result.filePath, variant: 'success' })
    return result.filePath
  })

  ipcMain.handle('instances:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Triad instance',
      properties: ['openFile'],
      filters: [{ name: 'Triad instance', extensions: ['triadpack'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const instance = await importTriadPack(store, result.filePaths[0])
    events.toast({ title: 'Instance imported', description: instance.name, variant: 'success' })
    return instance
  })

  ipcMain.handle('instances:openFolder', async (_event, id: string) => {
    const instance = store.requireInstance(id)
    await shell.openPath(store.instanceDir(instance.id))
  })

  ipcMain.handle('instances:openSaves', async (_event, id: string) => {
    const instance = store.requireInstance(id)
    await shell.openPath(join(store.minecraftDir(instance.id), 'saves'))
  })

  ipcMain.handle('instances:worlds', async (_event, id: string): Promise<World[]> => {
    const instance = store.requireInstance(id)
    const saves = join(store.minecraftDir(instance.id), 'saves')
    let entries: string[] = []
    try {
      entries = await readdir(saves)
    } catch {
      return []
    }
    const worlds: World[] = []
    for (const folder of entries) {
      const path = join(saves, folder)
      try {
        const info = await stat(join(path, 'level.dat'))
        worlds.push({
          folder,
          name: folder.replace(/_/g, ' '),
          lastPlayed: info.mtimeMs,
          size: info.size
        })
      } catch {
        // Not a world folder.
      }
    }
    return worlds.sort((a, b) => b.lastPlayed - a.lastPlayed)
  })

  ipcMain.handle('versions:list', async () => listVersions(store.settings.showSnapshots))
  ipcMain.handle('versions:loaders', async (_event, mcVersion: string, loader: LoaderType) => {
    if (!LOADERS.includes(loader)) return []
    return await loaderVersions(String(mcVersion), loader)
  })
  ipcMain.handle('java:detect', async (_event, refresh?: boolean) => await detectJava(!!refresh))
  ipcMain.handle('java:install', async (_event, requiredMajor?: number) => {
    const major = clamp(requiredMajor ?? 21, 8, 64, 21)
    const task = tasks.create(`Installing Java ${major}`, 'install')
    try {
      const java = await installJavaRuntime(
        major,
        (progress, stage) => task.update(progress, stage),
        task.signal
      )
      task.done()
      return java
    } catch (error) {
      task.fail(error)
      throw error
    }
  })

  ipcMain.handle('launch:start', async (_event, instanceId: string, server?: string, world?: string) => {
    const address = server ? normalizeServer({ address: String(server) }).address : undefined
    const folder = world ? String(world).replace(/[\\/:*?"<>|]/g, '').slice(0, 160) : undefined
    launcher.start(String(instanceId), address, folder)
  })
  ipcMain.handle('launch:stop', async () => launcher.stop())
  ipcMain.handle('launch:logs', async (_event, instanceId: string) => await launcher.getLogs(instanceId))

  ipcMain.handle('mods:list', async (_event, instanceId: string) => await content.listMods(instanceId))
  ipcMain.handle('mods:importJar', async (_event, instanceId: string, paths: string[]) => {
    if (!Array.isArray(paths) || !paths.length) return []
    if (paths.length > 64) throw new Error('Add at most 64 JAR files at a time.')
    return await content.importMods(
      instanceId,
      paths.map((path) => String(path))
    )
  })
  ipcMain.handle(
    'mods:setEnabled',
    async (_event, instanceId: string, fileName: string, enabled: boolean) => {
      await content.setModEnabled(instanceId, fileName, enabled)
    }
  )
  ipcMain.handle('mods:remove', async (_event, instanceId: string, fileName: string) => {
    await content.removeMod(instanceId, fileName)
  })
  ipcMain.handle('mods:openFolder', async (_event, instanceId: string) => {
    await content.openModsFolder(instanceId)
  })
  ipcMain.handle('mods:checkUpdates', async (_event, instanceId: string) => {
    return await content.checkUpdates(instanceId)
  })
  ipcMain.handle('mods:applyUpdate', async (_event, instanceId: string, update: ModUpdate) => {
    if (!update?.projectId || !update?.latestId) throw new Error('Invalid update.')
    return content.installProject(instanceId, update.projectId, update.latestId)
  })

  ipcMain.handle('modrinth:search', async (_event, params: ModrinthSearchParams) => {
    if (!PROJECT_TYPES.includes(params.projectType)) throw new Error('Unknown project type.')
    return await searchProjects({
      query: String(params.query ?? '').slice(0, 120),
      projectType: params.projectType,
      gameVersion: params.gameVersion || undefined,
      loader: params.loader || undefined,
      category: params.category ? String(params.category).slice(0, 40) : undefined,
      sort: params.sort,
      offset: clamp(params.offset ?? 0, 0, 10_000, 0),
      limit: clamp(params.limit ?? 20, 1, 40, 20)
    })
  })
  ipcMain.handle('modrinth:project', async (_event, id: string) => await getProject(String(id)))
  ipcMain.handle(
    'modrinth:versions',
    async (_event, id: string, opts?: { gameVersion?: string; loader?: string }) =>
      await getProjectVersions(String(id), opts ?? {})
  )
  ipcMain.handle(
    'modrinth:install',
    async (_event, instanceId: string, projectId: string, versionId?: string) =>
      content.installProject(instanceId, projectId, versionId)
  )
  ipcMain.handle('modrinth:installModpack', async (_event, projectId: string, versionId: string) => {
    return content.installModpack(String(projectId), String(versionId))
  })

  ipcMain.handle('account:get', async () => store.data.account)
  ipcMain.handle('account:loginMicrosoft', async () => {
    return await startMicrosoftLogin(
      store.settings.clientId,
      (account: Account) => {
        store.data.account = account
        store.save(true)
        events.account(account)
        events.dataChanged('account')
        events.toast({
          title: `Welcome, ${account.name}`,
          description: 'Microsoft account connected.',
          variant: 'success'
        })
      },
      (error, authGuidance) => {
        const guidance = authGuidance ?? explainAuthError(error)
        events.toast({
          title: guidance.title,
          description: guidance.summary,
          variant: 'error'
        })
      }
    )
  })
  ipcMain.handle('account:cancelLogin', async () => {
    cancelLogin()
    events.authState({ status: 'idle' })
  })
  ipcMain.handle('account:setOffline', async (_event, name: string) => {
    const safeName = validateOfflineName(String(name))
    const account: Account = {
      type: 'offline',
      name: safeName,
      uuid: offlineUuid(safeName)
    }
    store.data.account = account
    store.save(true)
    events.account(account)
    events.dataChanged('account')
    events.toast({ title: `Playing as ${safeName}`, description: 'Offline profile saved.' })
    return account
  })
  ipcMain.handle('account:logout', async () => {
    store.data.account = null
    store.save(true)
    events.account(null)
    events.dataChanged('account')
  })

  ipcMain.handle('skins:load', async () => loadSkins())
  ipcMain.handle('skins:save', async (_event, kind: 'skin' | 'cape', dataUrl: string) =>
    saveSkin(kind, dataUrl)
  )
  ipcMain.handle('skins:clear', async (_event, kind: 'skin' | 'cape') => clearSkin(kind))
  ipcMain.handle('skins:apply', async (_event, dataUrl: string, variant: 'classic' | 'slim') =>
    applyMinecraftSkin(store, dataUrl, variant)
  )
  ipcMain.handle('auto:status', async () => auto.status())
  ipcMain.handle('auto:run', async () => auto.run())
  ipcMain.handle('updater:status', async () => updater.status())
  ipcMain.handle('updater:check', async () => await updater.check())
  ipcMain.handle('updater:download', async () => await updater.download())
  ipcMain.handle('updater:install', async () => await updater.install())

  ipcMain.handle('tasks:list', async () => tasks.list())
  ipcMain.handle('tasks:cancel', async (_event, id: string) => tasks.cancel(String(id)))
  ipcMain.handle('tasks:dismiss', async (_event, id: string) => tasks.dismiss(String(id)))
}
