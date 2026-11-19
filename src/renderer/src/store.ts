import { create } from 'zustand'
import type {
  Account,
  AppInfo,
  AuthState,
  AutoDownloadStatus,
  DeviceCodeInfo,
  Instance,
  LaunchState,
  ModrinthSearchParams,
  ProjectType,
  Settings,
  Stats,
  TaskState,
  ToastMessage
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { api, errorMessage } from './api'

export type Route =
  | 'home'
  | 'library'
  | 'instance'
  | 'browse'
  | 'performance'
  | 'downloads'
  | 'skins'
  | 'settings'

export interface BrowseState {
  projectType: ProjectType
  query: string
  gameVersion: string
  loader: string
  category: string
  sort: NonNullable<ModrinthSearchParams['sort']>
  instanceId: string | null
}

interface ProjectModal {
  id: string
  projectType: ProjectType
}

interface AppState {
  ready: boolean
  route: Route
  settings: Settings
  account: Account | null
  instances: Instance[]
  activeInstanceId: string | null
  selectedInstanceId: string | null
  appInfo: AppInfo | null
  stats: Stats
  tasks: TaskState[]
  launch: LaunchState
  launchLogs: string[]
  toasts: ToastMessage[]
  deviceCode: DeviceCodeInfo | null
  auth: AuthState
  paletteOpen: boolean
  newInstanceOpen: boolean
  accountOpen: boolean
  skinStudioOpen: boolean
  autoStatus: AutoDownloadStatus | null
  projectModal: ProjectModal | null
  browse: BrowseState
  modsTick: number

  init: () => Promise<void>
  navigate: (route: Route) => void
  openInstance: (id: string) => void
  openProject: (id: string, projectType: ProjectType) => void
  closeProject: () => void
  setSettings: (patch: Partial<Settings>) => Promise<void>
  refreshSettings: () => Promise<void>
  refreshAccount: () => Promise<void>
  refreshInstances: () => Promise<void>
  refreshStats: () => Promise<void>
  setActiveInstance: (id: string) => void
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void
  dismissToast: (id: string) => void
  upsertTask: (task: TaskState) => void
  dismissTask: (id: string) => Promise<void>
  cancelTask: (id: string) => Promise<void>
  setLaunch: (launch: LaunchState) => void
  appendLaunchLog: (line: string) => void
  clearLaunch: () => void
  setDeviceCode: (code: DeviceCodeInfo | null) => void
  setAuth: (auth: AuthState) => void
  setPaletteOpen: (open: boolean) => void
  setNewInstanceOpen: (open: boolean) => void
  setAccountOpen: (open: boolean) => void
  setSkinStudioOpen: (open: boolean) => void
  refreshAutoStatus: () => Promise<void>
  setBrowse: (patch: Partial<BrowseState>) => void
  bumpMods: () => void
}

let toastSeq = 0

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  route: 'home',
  settings: DEFAULT_SETTINGS,
  account: null,
  instances: [],
  activeInstanceId: null,
  selectedInstanceId: null,
  appInfo: null,
  stats: { days: {}, sessions: [] },
  tasks: [],
  launch: { status: 'idle' },
  launchLogs: [],
  toasts: [],
  deviceCode: null,
  auth: { status: 'idle' },
  paletteOpen: false,
  newInstanceOpen: false,
  accountOpen: false,
  skinStudioOpen: false,
  autoStatus: null,
  projectModal: null,
  browse: {
    projectType: 'mod',
    query: '',
    gameVersion: '',
    loader: '',
    category: '',
    sort: 'relevance',
    instanceId: null
  },
  modsTick: 0,

  init: async () => {
    try {
      const [settings, account, instances, tasks, appInfo, stats] = await Promise.all([
        api.settings.get(),
        api.account.get(),
        api.instances.list(),
        api.tasks.list(),
        api.app.info(),
        api.app.stats()
      ])
      const recentlyPlayed = [...instances].sort(
        (a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)
      )[0]
      set({
        settings,
        account,
        instances,
        tasks,
        appInfo,
        stats,
        activeInstanceId: recentlyPlayed?.id ?? null,
        ready: true
      })
    } catch (error) {
      set({ ready: true })
      get().pushToast({
        title: 'Could not load launcher data',
        description: errorMessage(error),
        variant: 'error'
      })
    }
  },

  navigate: (route) => set({ route, paletteOpen: false }),
  openInstance: (id) => set({ route: 'instance', selectedInstanceId: id, paletteOpen: false }),
  openProject: (id, projectType) => set({ projectModal: { id, projectType }, paletteOpen: false }),
  closeProject: () => set({ projectModal: null }),

  setSettings: async (patch) => {
    const previous = get().settings
    set({ settings: { ...previous, ...patch } })
    try {
      const saved = await api.settings.update(patch)
      set({ settings: saved })
    } catch (error) {
      set({ settings: previous })
      get().pushToast({
        title: 'Could not save settings',
        description: errorMessage(error),
        variant: 'error'
      })
    }
  },

  refreshSettings: async () => {
    set({ settings: await api.settings.get() })
  },

  refreshAccount: async () => {
    set({ account: await api.account.get() })
  },

  refreshInstances: async () => {
    const instances = await api.instances.list()
    const current = get().activeInstanceId
    set({
      instances,
      activeInstanceId:
        current && instances.some((instance) => instance.id === current)
          ? current
          : (instances[0]?.id ?? null)
    })
  },

  refreshStats: async () => {
    set({ stats: await api.app.stats() })
  },

  setActiveInstance: (id) => {
    if (get().instances.some((instance) => instance.id === id)) {
      set({ activeInstanceId: id })
    }
  },

  pushToast: (toast) => {
    const id = `toast_${++toastSeq}`
    set({ toasts: [...get().toasts, { ...toast, id }] })
    window.setTimeout(
      () => get().dismissToast(id),
      toast.variant === 'error' ? 9000 : 5000
    )
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),

  upsertTask: (task) => {
    const existing = get().tasks
    const index = existing.findIndex((entry) => entry.id === task.id)
    let next: TaskState[]
    if (index >= 0) {
      next = [...existing]
      next[index] = task
    } else {
      next = [task, ...existing]
    }
    next.sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1
      if (b.status === 'running' && a.status !== 'running') return 1
      return b.startedAt - a.startedAt
    })
    set({ tasks: next.slice(0, 40) })
    if (task.status === 'done' && task.data?.instanceId) {
      void get().refreshInstances()
    }
  },

  dismissTask: async (id) => {
    await api.tasks.dismiss(id)
    set({ tasks: get().tasks.filter((task) => task.id !== id) })
  },

  cancelTask: async (id) => {
    await api.tasks.cancel(id)
  },

  setLaunch: (launch) => {
    const previous = get().launch
    if (launch.status === 'preparing' && previous.status !== 'preparing') {
      set({ launchLogs: [] })
    }
    set({ launch })
    if (launch.instanceId && (launch.status === 'preparing' || launch.status === 'running')) {
      set({ activeInstanceId: launch.instanceId })
    }
  },

  appendLaunchLog: (line) => {
    const logs = [...get().launchLogs, line]
    set({ launchLogs: logs.slice(-300) })
  },

  clearLaunch: () => set({ launch: { status: 'idle' }, launchLogs: [] }),

  setDeviceCode: (code) => set({ deviceCode: code }),
  setAuth: (auth) => set({ auth }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setNewInstanceOpen: (open) => set({ newInstanceOpen: open }),
  setAccountOpen: (open) => set({ accountOpen: open }),
  setSkinStudioOpen: (open) => set({ skinStudioOpen: open }),
  refreshAutoStatus: async () => set({ autoStatus: await api.auto.status() }),
  setBrowse: (patch) => set({ browse: { ...get().browse, ...patch } }),
  bumpMods: () => set({ modsTick: get().modsTick + 1 })
}))
