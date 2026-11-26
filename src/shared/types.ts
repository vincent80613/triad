import type { AuthGuidance } from './authErrors'

export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'
export type ProjectType = 'mod' | 'modpack' | 'resourcepack' | 'shader'
export type WallpaperMode = 'aurora' | 'system'
export type UiDensity = 'compact' | 'comfortable' | 'spacious'
export type LanguageCode = 'en' | 'nl' | 'de' | 'fr' | 'es' | 'pt'

export interface Settings {
  theme: string
  accent: string | null
  glassBlur: number
  glassTint: number
  motion: boolean
  wallpaper: WallpaperMode
  radius: number
  memoryMb: number
  javaPath: string
  closeOnLaunch: boolean
  showSnapshots: boolean
  memorySaver: boolean
  potatoGraphics: boolean
  potatoGraphicsLevel: number
  clientId: string
  uiDensity: UiDensity
  fontScale: number
  sidebarCompact: boolean
  showCardPlaytime: boolean
  confirmDelete: boolean
  autoDownload: boolean
  autoUpdateMods: boolean
  language: LanguageCode
  launchOnStartup: boolean
  discordPresence: boolean
  discordHideServerAddress: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'nebula',
  accent: null,
  glassBlur: 24,
  glassTint: 100,
  motion: true,
  wallpaper: 'aurora',
  radius: 18,
  memoryMb: 4096,
  javaPath: '',
  closeOnLaunch: false,
  showSnapshots: false,
  memorySaver: true,
  potatoGraphics: false,
  potatoGraphicsLevel: 100,
  clientId: '00000000402b5328',
  uiDensity: 'comfortable',
  fontScale: 100,
  sidebarCompact: false,
  showCardPlaytime: true,
  confirmDelete: true,
  autoDownload: true,
  autoUpdateMods: false,
  language: 'en',
  launchOnStartup: false,
  discordPresence: true,
  discordHideServerAddress: false
}

export interface ServerEntry {
  name: string
  address: string
}

export type ServerSoftware = 'vanilla' | 'fabric'
export type WorldPreset = 'default' | 'flat' | 'large_biomes' | 'amplified' | 'island' | 'sky_island'
export type IslandTheme = 'grass' | 'desert' | 'snow' | 'nether'
export type HostedServerStatus =
  | 'stopped'
  | 'installing'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

export interface HostedServerCommand {
  id: string
  label: string
  command: string
}

export interface HostedServer {
  id: string
  name: string
  mcVersion: string
  software: ServerSoftware
  loaderVersion?: string
  port: number
  memoryMb: number
  created: number
  lastStarted?: number
  properties: Record<string, string>
  commands: HostedServerCommand[]
  address?: string
  gamerules: Record<string, string>
  worldPreset?: WorldPreset
  islandTheme?: IslandTheme
  autoSaveMinutes?: number
  imported?: boolean
  sourcePath?: string
  jarFile?: string
  javaMajor?: number
}

export interface HostedServerState {
  id: string
  status: HostedServerStatus
  message?: string
  players: number
  progress?: number | null
  startedAt?: number
}

export interface HostedServerCustomAddress {
  address: string
  resolves: boolean
  addresses: string[]
}

export interface HostedServerJoinInfo {
  /** localhost:port — always works for players on this PC. */
  local: string
  /** LAN addresses on this PC, already including the server port. */
  lan: string[]
  custom?: HostedServerCustomAddress
}

export type PublicAccessState = 'idle' | 'awaiting-claim' | 'starting' | 'online' | 'error'

export interface PublicAccessStatus {
  state: PublicAccessState
  provider: 'playit.gg'
  /** Public hostname or host:port friends can add in Minecraft. */
  address?: string
  /** One-time playit claim page while the account is being connected. */
  claimUrl?: string
  error?: string
  /** Extra progress text shown while downloading or connecting. */
  detail?: string
  helpUrl?: string
}

export interface CreateHostedServerInput {
  name: string
  mcVersion: string
  software: ServerSoftware
  port: number
  memoryMb: number
  address?: string
  worldPreset?: WorldPreset
  islandTheme?: IslandTheme
  levelSeed?: string
}

export interface HostedServerPatch {
  name?: string
  port?: number
  memoryMb?: number
  address?: string | null
  properties?: Record<string, string>
  gamerules?: Record<string, string>
  worldPreset?: WorldPreset
  islandTheme?: IslandTheme
  autoSaveMinutes?: number
}

export interface ServerBackup {
  name: string
  path: string
  createdAt: number
}

export interface Instance {
  id: string
  name: string
  icon: string
  tint: string
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
  versionId?: string
  created: number
  lastPlayed?: number
  playtimeMs: number
  memoryMb?: number
  javaPath?: string
  jvmArgs?: string
  notes?: string
  modpackProjectId?: string
  modpackVersionId?: string
  servers?: ServerEntry[]
  tags?: string[]
  group?: string
  favorite?: boolean
}

export type HealthStatus = 'ok' | 'warn' | 'error'

export interface HealthCheck {
  id: string
  label: string
  status: HealthStatus
  detail: string
  fixable?: boolean
}

export interface HealthReport {
  status: 'healthy' | 'attention' | 'broken'
  checks: HealthCheck[]
  checkedAt: number
}

export interface SkinAssets {
  skin?: string
  cape?: string
}

export type SkinVariant = 'classic' | 'slim'

export interface SkinApplyResult {
  name: string
  uuid: string
  variant: SkinVariant
  appliedAt: number
  textureUrl?: string
}

export type SkinCatalogSort = 'top' | 'latest' | 'recently-commented'

export interface SkinCatalogEntry {
  id: string
  name: string
  slug: string
  author: string
  previewUrl: string
  pageUrl: string
  likes: number
  comments: number
}

export interface SkinCatalogRequest {
  sort: SkinCatalogSort
  page: number
  query?: string
}

export interface SkinCatalogPage {
  entries: SkinCatalogEntry[]
  page: number
  sort: SkinCatalogSort
  query: string
  hasMore: boolean
  source: 'minecraftskins.com'
}

export interface SkinCatalogTexture {
  id: string
  dataUrl: string
  variant: SkinVariant
  pageUrl: string
}

export interface SkinSelectionMeta {
  id: string
  name: string
  author?: string
  pageUrl?: string
}

export interface SkinSelection extends SkinSelectionMeta {
  variant: SkinVariant
  dataUrl: string
  appliedAt: number
}

export interface AutoDownloadStatus {
  running: boolean
  lastRun?: number
  nextRun?: number
  message: string
  autoDownload: boolean
  autoUpdateMods: boolean
}

export type UpdaterPhase =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdaterStatus {
  phase: UpdaterPhase
  message: string
  version?: string
  percent?: number
  checkedAt?: number
  feedConfigured: boolean
}

export interface Account {
  type: 'offline' | 'microsoft'
  name: string
  uuid: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  skinUpdatedAt?: number
}

export interface JavaInfo {
  path: string
  version: string
  major: number
}

export interface McVersion {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
}

export interface LoaderVersion {
  version: string
  stable?: boolean
  label?: string
}

export interface InstalledMod {
  fileName: string
  title: string
  iconUrl?: string
  projectId?: string
  versionId?: string
  versionNumber?: string
  enabled: boolean
  size: number
  source: 'modrinth' | 'modpack' | 'manual'
  installedAt: number
  update?: { versionId: string; versionNumber: string }
}

export interface World {
  folder: string
  name: string
  lastPlayed: number
  size: number
}

export interface SessionRecord {
  instanceId: string
  startedAt: number
  durationMs: number
  crashed: boolean
}

export interface Stats {
  days: Record<string, number>
  sessions: SessionRecord[]
}

export interface AppData {
  version: number
  settings: Settings
  instances: Instance[]
  activeInstanceId: string | null
  account: Account | null
  stats: Stats
  mods: Record<string, Record<string, ModRecord>>
  servers: HostedServer[]
  lastSeenVersion?: string
}

export interface ModRecord {
  file: string
  title: string
  iconUrl?: string
  projectId?: string
  versionId?: string
  versionNumber?: string
  source: 'modrinth' | 'modpack' | 'manual'
  installedAt: number
}

export type TaskKind = 'install' | 'launch' | 'modpack' | 'mod' | 'download'
export type TaskStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface TaskState {
  id: string
  title: string
  subtitle?: string
  kind: TaskKind
  status: TaskStatus
  progress: number | null
  stage?: string
  error?: string
  startedAt: number
  finishedAt?: number
  data?: { instanceId?: string }
}

export type LaunchStatus = 'idle' | 'preparing' | 'running' | 'stopping' | 'error'

export interface LaunchState {
  status: LaunchStatus
  instanceId?: string
  stage?: string
  progress?: number
  error?: string
  startedAt?: number
  pid?: number
}

export interface DeviceCodeInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export interface AuthState {
  status: 'idle' | 'waiting' | 'working' | 'error' | 'done'
  message?: string
  error?: string
  guidance?: AuthGuidance
}

export interface AppInfo {
  version: string
  electron: string
  platform: string
  userData: string
  instancesDir: string
  isWindows11: boolean
  lastSeenVersion?: string
}

export interface CreateInstanceInput {
  name: string
  icon: string
  tint: string
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
  memoryMb?: number
}

export interface ModrinthSearchParams {
  query: string
  projectType: ProjectType
  gameVersion?: string
  loader?: string
  category?: string
  sort?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'
  offset?: number
  limit?: number
}

export interface ModrinthSearchHit {
  project_id: string
  slug: string
  title: string
  description: string
  categories: string[]
  project_type: string
  downloads: number
  follows: number
  icon_url: string | null
  color: number | null
  date_modified: string
  latest_version?: string
  author: string
  gallery?: string[]
}

export interface ModrinthSearchResults {
  hits: ModrinthSearchHit[]
  offset: number
  limit: number
  total_hits: number
}

export interface ModrinthProject {
  id: string
  slug: string
  title: string
  description: string
  body: string
  categories: string[]
  client_side: string
  server_side: string
  project_type: string
  downloads: number
  followers: number
  icon_url: string | null
  color: number | null
  issues_url: string | null
  source_url: string | null
  wiki_url: string | null
  discord_url: string | null
  gallery: { url: string; featured: boolean; title?: string; description?: string }[]
  published: string
  updated: string
  license?: { id: string; name: string }
  loaders: string[]
  game_versions: string[]
  team: string
}

export interface ModrinthVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  version_type: string
  game_versions: string[]
  loaders: string[]
  date_published: string
  downloads: number
  changelog?: string
  files: {
    hashes: { sha1?: string; sha512?: string }
    url: string
    filename: string
    primary: boolean
    size: number
  }[]
  dependencies: {
    version_id: string | null
    project_id: string | null
    file_name: string | null
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
  }[]
}

export interface ModUpdate {
  fileName: string
  projectId: string
  title: string
  current: string
  latestId: string
  latestNumber: string
  iconUrl?: string
}

export interface ToastMessage {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'success' | 'error'
}

export type ToastInput = Omit<ToastMessage, 'id'>

export interface Api {
  app: {
    info: () => Promise<AppInfo>
    openExternal: (url: string) => Promise<void>
    openPath: (path: string) => Promise<void>
    setWallpaper: (mode: WallpaperMode) => Promise<void>
    relaunch: () => Promise<void>
    stats: () => Promise<Stats>
    markVersionSeen: () => Promise<void>
  }
  updater: {
    status: () => Promise<UpdaterStatus>
    check: () => Promise<UpdaterStatus>
    download: () => Promise<UpdaterStatus>
    install: () => Promise<void>
  }
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    setZoom: (factor: number) => void
  }
  settings: {
    get: () => Promise<Settings>
    update: (patch: Partial<Settings>) => Promise<Settings>
  }
  instances: {
    list: () => Promise<Instance[]>
    create: (input: CreateInstanceInput) => Promise<{ instance: Instance; taskId: string }>
    update: (id: string, patch: Partial<Instance>) => Promise<Instance>
    remove: (id: string) => Promise<void>
    duplicate: (id: string) => Promise<Instance>
    openFolder: (id: string) => Promise<void>
    openSaves: (id: string) => Promise<void>
    worlds: (id: string) => Promise<World[]>
    addServer: (id: string, server: ServerEntry) => Promise<Instance>
    removeServer: (id: string, address: string) => Promise<Instance>
    reorder: (ids: string[]) => Promise<Instance[]>
    health: (id: string) => Promise<HealthReport>
    repair: (id: string) => Promise<string>
    export: (id: string) => Promise<string | null>
    import: () => Promise<Instance | null>
  }
  skins: {
    load: () => Promise<SkinAssets>
    save: (kind: 'skin' | 'cape', dataUrl: string) => Promise<SkinAssets>
    clear: (kind: 'skin' | 'cape') => Promise<SkinAssets>
    apply: (
      dataUrl: string,
      variant: SkinVariant,
      meta?: SkinSelectionMeta
    ) => Promise<SkinApplyResult>
    catalog: (request: SkinCatalogRequest) => Promise<SkinCatalogPage>
    texture: (request: { id: string; pageUrl: string }) => Promise<SkinCatalogTexture>
    selection: () => Promise<SkinSelection | null>
    favorites: () => Promise<SkinCatalogEntry[]>
    setFavorite: (entry: SkinCatalogEntry, favorite: boolean) => Promise<SkinCatalogEntry[]>
  }
  auto: {
    status: () => Promise<AutoDownloadStatus>
    run: () => Promise<AutoDownloadStatus>
  }
  versions: {
    list: () => Promise<McVersion[]>
    loaders: (mcVersion: string, loader: LoaderType) => Promise<LoaderVersion[]>
  }
  java: {
    detect: (refresh?: boolean) => Promise<JavaInfo[]>
    install: (requiredMajor?: number) => Promise<JavaInfo>
  }
  launch: {
    start: (instanceId: string, server?: string, world?: string) => Promise<void>
    stop: () => Promise<void>
    logs: (instanceId: string) => Promise<string>
  }
  mods: {
    list: (instanceId: string) => Promise<InstalledMod[]>
    importJar: (instanceId: string, files: unknown[]) => Promise<string[]>
    setEnabled: (instanceId: string, fileName: string, enabled: boolean) => Promise<void>
    remove: (instanceId: string, fileName: string) => Promise<void>
    openFolder: (instanceId: string) => Promise<void>
    checkUpdates: (instanceId: string) => Promise<ModUpdate[]>
    applyUpdate: (instanceId: string, update: ModUpdate) => Promise<void>
  }
  modrinth: {
    search: (params: ModrinthSearchParams) => Promise<ModrinthSearchResults>
    project: (id: string) => Promise<ModrinthProject>
    versions: (
      id: string,
      opts?: { gameVersion?: string; loader?: string }
    ) => Promise<ModrinthVersion[]>
    install: (instanceId: string, projectId: string, versionId?: string) => Promise<string>
    installModpack: (projectId: string, versionId: string) => Promise<string>
  }
  account: {
    get: () => Promise<Account | null>
    loginMicrosoft: () => Promise<DeviceCodeInfo>
    cancelLogin: () => Promise<void>
    setOffline: (name: string) => Promise<Account>
    logout: () => Promise<void>
  }
  tasks: {
    list: () => Promise<TaskState[]>
    cancel: (id: string) => Promise<void>
    dismiss: (id: string) => Promise<void>
  }
  hosting: {
    list: () => Promise<HostedServer[]>
    states: () => Promise<Record<string, HostedServerState>>
    joinInfo: (id: string) => Promise<HostedServerJoinInfo>
    publicAccess: (id: string) => Promise<PublicAccessStatus>
    publicAccessEnable: (id: string) => Promise<PublicAccessStatus>
    publicAccessDisable: (id: string) => Promise<PublicAccessStatus>
    create: (input: CreateHostedServerInput) => Promise<HostedServer>
    update: (id: string, patch: HostedServerPatch) => Promise<HostedServer>
    remove: (id: string) => Promise<void>
    start: (id: string) => Promise<void>
    stop: (id: string) => Promise<void>
    command: (id: string, command: string) => Promise<void>
    logs: (id: string) => Promise<string[]>
    addCommand: (id: string, label: string, command: string) => Promise<HostedServer>
    removeCommand: (id: string, commandId: string) => Promise<HostedServer>
    openFolder: (id: string) => Promise<void>
    import: () => Promise<HostedServer | null>
    backups: (id: string) => Promise<ServerBackup[]>
    backup: (id: string) => Promise<ServerBackup>
    openBackups: (id: string) => Promise<void>
  }
  on: {
    task: (cb: (task: TaskState) => void) => () => void
    launchState: (cb: (state: LaunchState) => void) => () => void
    launchLog: (cb: (line: { instanceId: string; line: string }) => void) => () => void
    authDevice: (cb: (info: DeviceCodeInfo) => void) => () => void
    authState: (cb: (state: AuthState) => void) => () => void
    account: (cb: (account: Account | null) => void) => () => void
    dataChanged: (cb: (scope: DataScope) => void) => () => void
    maximized: (cb: (value: boolean) => void) => () => void
    updater: (cb: (status: UpdaterStatus) => void) => () => void
    toast: (cb: (toast: ToastInput) => void) => () => void
    hostState: (cb: (state: HostedServerState) => void) => () => void
    hostLog: (cb: (line: { id: string; line: string }) => void) => () => void
  }
}

export type DataScope = 'instances' | 'settings' | 'account' | 'stats' | `mods:${string}`
