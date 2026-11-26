import { app, BrowserWindow, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AutoDownloader } from './auto'
import { ContentManager } from './content'
import { ServerManager } from './hosting'
import { bindWindow, events } from './events'
import { registerIpc, type Services } from './ipc'
import { Launcher } from './launch'
import { PlayitTunnelManager } from './playit'
import { DiscordPresence } from './presence'
import { Store } from './store'
import { TaskManager } from './tasks'
import { Updater } from './updater'

let window: BrowserWindow | null = null
let services: Services | null = null

function memorySaverEnabled(): boolean {
  try {
    const file = join(app.getPath('userData'), 'triad.json')
    const data = JSON.parse(readFileSync(file, 'utf8')) as {
      settings?: { memorySaver?: boolean }
    }
    return data.settings?.memorySaver !== false
  } catch {
    return true
  }
}

// This must run before Electron is ready. It keeps the launcher to one light
// software-rendered process instead of a separate GPU process.
if (memorySaverEnabled()) app.disableHardwareAcceleration()

function createWindow(store: Store): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const icon = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'resources', 'icon.png')
  const created = new BrowserWindow({
    width: 1380,
    height: 900,
    title: 'Triad',
    icon,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    backgroundColor: '#00000000',
    backgroundMaterial: !isMac && store.settings.wallpaper === 'system' ? 'acrylic' : 'none',
    autoHideMenuBar: true,
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  created.setMenuBarVisibility(false)
  created.once('ready-to-show', () => {
    created.show()
  })
  created.on('maximize', () => events.maximized(true))
  created.on('unmaximize', () => events.maximized(false))
  created.on('closed', () => {
    if (window === created) window = null
  })

  created.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  created.webContents.on('will-navigate', (event, url) => {
    const current = created.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void created.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void created.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return created
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('com.triad.launcher')
    const store = new Store()
    await store.init()
    const tasks = new TaskManager()
    const content = new ContentManager(store, tasks)
    const presence = new DiscordPresence()
    const launcher = new Launcher(store, presence)
    const auto = new AutoDownloader(store, tasks, content)
    const hosting = new ServerManager(store)
    const tunnels = new PlayitTunnelManager()
    await tunnels.init()
    const updater = new Updater(() => window)

    services = {
      store,
      tasks,
      content,
      launcher,
      auto,
      hosting,
      tunnels,
      updater,
      getWindow: () => window
    }
    registerIpc(services)
    if (process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: store.settings.launchOnStartup })
    }
    auto.start()

    window = createWindow(store)
    bindWindow(window)
    if (store.settings.discordPresence) presence.start()
    updater.start()

    app.on('activate', () => {
      if (!window) {
        window = createWindow(store)
        bindWindow(window)
      }
    })
  })

  app.on('window-all-closed', () => {
    services?.store.save(true)
    if (process.platform !== 'darwin') app.quit()
  })

  let shuttingDown = false

  function shutdownServices(): void {
    services?.tunnels.dispose()
    services?.launcher.dispose()
    services?.auto.stop()
    services?.updater.stop()
    services?.tasks.cancelAll()
    // Minecraft runs in its own detached process so closing Triad does not
    // interrupt a game that is already running.
    services?.store.save(true)
  }

  app.on('before-quit', (event) => {
    if (shuttingDown) return
    // Hosted servers live in this app, so save their worlds before quitting.
    if (services?.hosting.runningCount()) {
      event.preventDefault()
      shuttingDown = true
      void services.hosting.dispose().finally(() => {
        shutdownServices()
        app.quit()
      })
      return
    }
    shuttingDown = true
    shutdownServices()
  })
}
