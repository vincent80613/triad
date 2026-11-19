import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import type { Api } from '@shared/types'

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
    openPath: (path) => ipcRenderer.invoke('app:openPath', path),
    setWallpaper: (mode) => ipcRenderer.invoke('app:setWallpaper', mode),
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    stats: () => ipcRenderer.invoke('app:stats'),
    markVersionSeen: () => ipcRenderer.invoke('app:markVersionSeen')
  },
  updater: {
    status: () => ipcRenderer.invoke('updater:status'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install')
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    setZoom: (factor) => {
      const safe = Math.min(1.4, Math.max(0.8, Number(factor) || 1))
      webFrame.setZoomFactor(safe)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch)
  },
  instances: {
    list: () => ipcRenderer.invoke('instances:list'),
    create: (input) => ipcRenderer.invoke('instances:create', input),
    update: (id, patch) => ipcRenderer.invoke('instances:update', id, patch),
    remove: (id) => ipcRenderer.invoke('instances:remove', id),
    duplicate: (id) => ipcRenderer.invoke('instances:duplicate', id),
    openFolder: (id) => ipcRenderer.invoke('instances:openFolder', id),
    openSaves: (id) => ipcRenderer.invoke('instances:openSaves', id),
    worlds: (id) => ipcRenderer.invoke('instances:worlds', id),
    addServer: (id, server) => ipcRenderer.invoke('instances:addServer', id, server),
    removeServer: (id, address) => ipcRenderer.invoke('instances:removeServer', id, address),
    reorder: (ids) => ipcRenderer.invoke('instances:reorder', ids),
    health: (id) => ipcRenderer.invoke('instances:health', id),
    repair: (id) => ipcRenderer.invoke('instances:repair', id),
    export: (id) => ipcRenderer.invoke('instances:export', id),
    import: () => ipcRenderer.invoke('instances:import')
  },
  skins: {
    load: () => ipcRenderer.invoke('skins:load'),
    save: (kind, dataUrl) => ipcRenderer.invoke('skins:save', kind, dataUrl),
    clear: (kind) => ipcRenderer.invoke('skins:clear', kind),
    apply: (dataUrl, variant) => ipcRenderer.invoke('skins:apply', dataUrl, variant)
  },
  auto: {
    status: () => ipcRenderer.invoke('auto:status'),
    run: () => ipcRenderer.invoke('auto:run')
  },
  versions: {
    list: () => ipcRenderer.invoke('versions:list'),
    loaders: (mcVersion, loader) => ipcRenderer.invoke('versions:loaders', mcVersion, loader)
  },
  java: {
    detect: (refresh) => ipcRenderer.invoke('java:detect', refresh),
    install: (requiredMajor) => ipcRenderer.invoke('java:install', requiredMajor)
  },
  launch: {
    start: (instanceId, server, world) =>
      ipcRenderer.invoke('launch:start', instanceId, server, world),
    stop: () => ipcRenderer.invoke('launch:stop'),
    logs: (instanceId) => ipcRenderer.invoke('launch:logs', instanceId)
  },
  mods: {
    list: (instanceId) => ipcRenderer.invoke('mods:list', instanceId),
    importJar: (instanceId, files) => {
      const paths: string[] = []
      for (const file of files) {
        try {
          const path = webUtils.getPathForFile(
            file as Parameters<typeof webUtils.getPathForFile>[0]
          )
          if (path) paths.push(path)
        } catch {
          // Ignore files that are not backed by a real path.
        }
      }
      if (!paths.length) return Promise.resolve([])
      return ipcRenderer.invoke('mods:importJar', instanceId, paths)
    },
    setEnabled: (instanceId, fileName, enabled) =>
      ipcRenderer.invoke('mods:setEnabled', instanceId, fileName, enabled),
    remove: (instanceId, fileName) => ipcRenderer.invoke('mods:remove', instanceId, fileName),
    openFolder: (instanceId) => ipcRenderer.invoke('mods:openFolder', instanceId),
    checkUpdates: (instanceId) => ipcRenderer.invoke('mods:checkUpdates', instanceId),
    applyUpdate: (instanceId, update) =>
      ipcRenderer.invoke('mods:applyUpdate', instanceId, update)
  },
  modrinth: {
    search: (params) => ipcRenderer.invoke('modrinth:search', params),
    project: (id) => ipcRenderer.invoke('modrinth:project', id),
    versions: (id, opts) => ipcRenderer.invoke('modrinth:versions', id, opts),
    install: (instanceId, projectId, versionId) =>
      ipcRenderer.invoke('modrinth:install', instanceId, projectId, versionId),
    installModpack: (projectId, versionId) =>
      ipcRenderer.invoke('modrinth:installModpack', projectId, versionId)
  },
  account: {
    get: () => ipcRenderer.invoke('account:get'),
    loginMicrosoft: () => ipcRenderer.invoke('account:loginMicrosoft'),
    cancelLogin: () => ipcRenderer.invoke('account:cancelLogin'),
    setOffline: (name) => ipcRenderer.invoke('account:setOffline', name),
    logout: () => ipcRenderer.invoke('account:logout')
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    cancel: (id) => ipcRenderer.invoke('tasks:cancel', id),
    dismiss: (id) => ipcRenderer.invoke('tasks:dismiss', id)
  },
  on: {
    task: (cb) => subscribe('task:update', cb),
    launchState: (cb) => subscribe('launch:state', cb),
    launchLog: (cb) => subscribe('launch:log', cb),
    authDevice: (cb) => subscribe('auth:device', cb),
    authState: (cb) => subscribe('auth:state', cb),
    account: (cb) => subscribe('account:changed', cb),
    dataChanged: (cb) => subscribe('data:changed', cb),
    maximized: (cb) => subscribe('window:maximized', cb),
    updater: (cb) => subscribe('updater:status', cb),
    toast: (cb) => subscribe('toast', cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
