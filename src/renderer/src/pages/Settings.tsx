import { useEffect, useState } from 'react'
import {
  Brush,
  Check,
  Cpu,
  Download,
  DownloadCloud,
  ExternalLink,
  FolderOpen,
  Globe2,
  HardDrive,
  Info,
  LayoutPanelTop,
  MessageCircle,
  Monitor,
  Palette,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  UserRound
} from 'lucide-react'
import {
  DEFAULT_SETTINGS,
  type AutoDownloadStatus,
  type JavaInfo,
  type LanguageCode,
  type SkinAssets,
  type UiDensity,
  type UpdaterStatus,
  type WallpaperMode
} from '@shared/types'
import {
  POTATO_MAX_LEVEL,
  POTATO_MIN_LEVEL,
  potatoLevelLabel,
  potatoPreset
} from '@shared/potato'
import { api, errorMessage } from '../api'
import { useApp } from '../store'
import { LANGUAGES, useT } from '../i18n'
import { ACCENTS, THEMES } from '../theme'
import { cn } from '../lib/format'
import { Glass } from '../components/Glass'
import { Chip, Segmented, Slider, Spinner, Toggle } from '../components/Controls'
import { SkinAvatar } from '../components/SkinAvatar'

type SettingsTab = 'appearance' | 'gameplay' | 'downloads' | 'advanced'

export function Settings() {
  const t = useT()
  const settings = useApp((state) => state.settings)
  const setSettings = useApp((state) => state.setSettings)
  const appInfo = useApp((state) => state.appInfo)
  const account = useApp((state) => state.account)
  const setAccountOpen = useApp((state) => state.setAccountOpen)
  const setSkinStudioOpen = useApp((state) => state.setSkinStudioOpen)
  const pushToast = useApp((state) => state.pushToast)
  const [tab, setTab] = useState<SettingsTab>('appearance')
  const [javas, setJavas] = useState<JavaInfo[]>([])
  const [javaLoading, setJavaLoading] = useState(false)
  const [javaInstalling, setJavaInstalling] = useState(false)
  const [clientId, setClientId] = useState(settings.clientId)
  const [autoStatus, setAutoStatus] = useState<AutoDownloadStatus | null>(null)
  const [autoRunning, setAutoRunning] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdaterStatus | null>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [skins, setSkins] = useState<SkinAssets>({})
  const clientIdDirty = clientId.trim() !== settings.clientId
  const windowsDesktopBlur = appInfo?.isWindows11 ?? false
  const potato = potatoPreset(settings.potatoGraphicsLevel)
  const potatoParticles =
    potato.particles === 2 ? 'minimal particles' : potato.particles === 1 ? 'fewer particles' : 'normal particles'

  useEffect(() => {
    setClientId(settings.clientId)
  }, [settings.clientId])

  useEffect(() => {
    void scanJava()
    void refreshAuto()
    void api.skins.load().then(setSkins).catch(() => undefined)
  }, [])

  useEffect(() => {
    void api.updater.status().then(setUpdateStatus).catch(() => undefined)
    return api.on.updater(setUpdateStatus)
  }, [])

  async function scanJava(force = true): Promise<void> {
    setJavaLoading(true)
    try {
      setJavas(await api.java.detect(force))
    } catch (error) {
      pushToast({ title: 'Java scan failed', description: errorMessage(error), variant: 'error' })
    } finally {
      setJavaLoading(false)
    }
  }

  async function installJava(): Promise<void> {
    setJavaInstalling(true)
    try {
      const java = await api.java.install(21)
      await scanJava(true)
      pushToast({
        title: `Java ${java.major} installed`,
        description: 'Triad will use it automatically for compatible versions.',
        variant: 'success'
      })
    } catch (error) {
      pushToast({
        title: 'Java install failed',
        description: errorMessage(error),
        variant: 'error'
      })
    } finally {
      setJavaInstalling(false)
    }
  }

  async function refreshAuto(): Promise<void> {
    setAutoStatus(await api.auto.status())
  }

  async function runAuto(): Promise<void> {
    setAutoRunning(true)
    try {
      const status = await api.auto.run()
      setAutoStatus(status)
      pushToast({
        title: 'Auto downloader finished',
        description: status.message,
        variant: 'success'
      })
    } catch (error) {
      pushToast({ title: 'Auto downloader failed', description: errorMessage(error), variant: 'error' })
    } finally {
      setAutoRunning(false)
    }
  }

  async function checkForUpdates(): Promise<void> {
    setUpdateChecking(true)
    try {
      const status = await api.updater.check()
      setUpdateStatus(status)
      if (status.phase === 'idle') {
        pushToast({
          title: 'Triad is up to date',
          description: appInfo?.version ? `You are running v${appInfo.version}.` : undefined,
          variant: 'success'
        })
      } else if (status.phase === 'available') {
        pushToast({
          title: `Triad ${status.version} is available`,
          description: 'Open Settings → Launcher updates to download it.'
        })
      } else if (status.phase === 'disabled' || status.phase === 'error') {
        pushToast({
          title: status.phase === 'disabled' ? 'Updates unavailable' : 'Update check failed',
          description: status.message,
          variant: 'error'
        })
      }
    } catch (error) {
      pushToast({ title: 'Update check failed', description: errorMessage(error), variant: 'error' })
    } finally {
      setUpdateChecking(false)
    }
  }

  async function downloadUpdate(): Promise<void> {
    try {
      const status = await api.updater.download()
      setUpdateStatus(status)
      if (status.phase === 'ready') {
        pushToast({
          title: 'Update ready to install',
          description: 'Restart Triad to finish updating. Patch notes will appear after it reopens.',
          variant: 'success'
        })
      }
    } catch (error) {
      pushToast({ title: 'Could not download update', description: errorMessage(error), variant: 'error' })
    }
  }

  async function installUpdate(): Promise<void> {
    try {
      await api.updater.install()
    } catch (error) {
      pushToast({ title: 'Could not install update', description: errorMessage(error), variant: 'error' })
    }
  }

  const updateBusy =
    updateChecking ||
    updateStatus?.phase === 'checking' ||
    updateStatus?.phase === 'downloading'
  const updateReady = updateStatus?.phase === 'ready'
  const updateAvailable = updateStatus?.phase === 'available'
  const updateDisabled = updateStatus?.phase === 'disabled'
  const updateTitle = updateReady
    ? 'Ready to install'
    : updateStatus?.phase === 'downloading'
      ? 'Downloading update'
      : updateStatus?.phase === 'available'
        ? 'Update available'
        : updateStatus?.phase === 'checking'
          ? 'Checking for updates'
          : updateStatus?.phase === 'error'
            ? 'Update check failed'
            : updateStatus?.phase === 'disabled'
              ? 'Updates unavailable'
              : 'Automatic updates on'

  return (
    <div className="page settings-page">
      <div className="page-header settings-header">
        <div className="page-heading">
          <div className="eyebrow">
            <Palette size={11} /> {t('settings.appearance')}
          </div>
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-sub">{t('settings.subtitle')}</p>
        </div>
        <div className="page-actions">
          <Chip tone="muted">Triad v{appInfo?.version ?? '—'}</Chip>
          <button
            type="button"
            className="btn btn-sm"
            disabled={updateBusy || updateDisabled}
            onClick={() => void checkForUpdates()}
            title={updateStatus?.message ?? 'Check for a new Triad build'}
          >
            {updateChecking || updateStatus?.phase === 'checking' ? (
              <Spinner size={13} />
            ) : (
              <RefreshCw size={13} />
            )}
            Check for updates
          </button>
        </div>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        <SettingsTabButton id="appearance" label={t('settings.appearance')} icon={<Palette size={15} />} tab={tab} setTab={setTab} />
        <SettingsTabButton id="gameplay" label={t('settings.gameplay')} icon={<Sparkles size={15} />} tab={tab} setTab={setTab} />
        <SettingsTabButton id="downloads" label={t('settings.downloads')} icon={<DownloadCloud size={15} />} tab={tab} setTab={setTab} />
        <SettingsTabButton id="advanced" label={t('settings.advanced')} icon={<ShieldCheck size={15} />} tab={tab} setTab={setTab} />
      </div>

      <div className="settings-stack">
        {tab === 'appearance' && (
          <>
            <Section
              icon={<Palette size={18} />}
              title="Themes"
              description="Sixteen moods. Every theme recolours the whole launcher instantly."
            >
              <div className="theme-grid theme-grid--rich">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className={cn('theme-card', settings.theme === theme.id && 'active')}
                    onClick={() => void setSettings({ theme: theme.id })}
                  >
                    <span
                      className="theme-swatch"
                      style={{
                        background: `radial-gradient(90% 120% at 20% 0%, ${theme.swatch[1]}, transparent 70%), linear-gradient(140deg, ${theme.swatch[0]}, ${theme.swatch[2]})`
                      }}
                    >
                      <span className="theme-swatch-glass" />
                    </span>
                    <span className="theme-copy">
                      <strong>{theme.name}</strong>
                      <span>{theme.blurb}</span>
                    </span>
                    {settings.theme === theme.id && (
                      <span className="theme-check">
                        <Check size={12} />
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Launcher colour</strong>
                  <span>Recolours the background, sidebar, glass and highlights.</span>
                </div>
                <div className="accent-row">
                  {ACCENTS.map((accent) => {
                    const active = (settings.accent ?? null) === accent.value
                    return (
                      <button
                        key={accent.name}
                        type="button"
                        className={cn('accent-dot', active && 'active')}
                        title={accent.name}
                        aria-label={accent.name}
                        style={
                          accent.value
                            ? { background: accent.value }
                            : {
                                background:
                                  'conic-gradient(from 210deg, #9a8cff, #4ea1ff, #45e6a8, #f5c451, #ff8fb8, #9a8cff)'
                              }
                        }
                        onClick={() => void setSettings({ accent: accent.value })}
                      >
                        {active && <Check size={11} />}
                      </button>
                    )
                  })}
                  <label className="accent-custom" title="Custom launcher colour">
                    <input
                      type="color"
                      value={settings.accent ?? '#9a8cff'}
                      onChange={(event) => void setSettings({ accent: event.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className="settings-two">
                <div className="settings-row column">
                  <div className="settings-row-label">
                    <strong>Glass blur</strong>
                    <span>{settings.glassBlur}px backdrop blur</span>
                  </div>
                  <Slider
                    value={settings.glassBlur}
                    min={0}
                    max={48}
                    onChange={(value) => void setSettings({ glassBlur: value })}
                    suffix="px"
                  />
                </div>
                <div className="settings-row column">
                  <div className="settings-row-label">
                    <strong>Glass tint</strong>
                    <span>{settings.glassTint}% light through the panels</span>
                  </div>
                  <Slider
                    value={settings.glassTint}
                    min={40}
                    max={140}
                    onChange={(value) => void setSettings({ glassTint: value })}
                    suffix="%"
                  />
                </div>
                <div className="settings-row column">
                  <div className="settings-row-label">
                    <strong>Corner radius</strong>
                    <span>{settings.radius}px on every glass surface</span>
                  </div>
                  <Slider
                    value={settings.radius}
                    min={8}
                    max={28}
                    onChange={(value) => void setSettings({ radius: value })}
                    suffix="px"
                  />
                </div>
                <div className="settings-row column">
                  <div className="settings-row-label">
                    <strong>Interface scale</strong>
                    <span>{settings.fontScale}% text and controls</span>
                  </div>
                  <Slider
                    value={settings.fontScale}
                    min={80}
                    max={140}
                    step={5}
                    onChange={(value) => void setSettings({ fontScale: value })}
                    suffix="%"
                  />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Density</strong>
                  <span>How much breathing room the interface has.</span>
                </div>
                <Segmented<UiDensity>
                  value={settings.uiDensity}
                  onChange={(value) => void setSettings({ uiDensity: value })}
                  options={[
                    { value: 'compact', label: 'Compact' },
                    { value: 'comfortable', label: 'Comfort' },
                    { value: 'spacious', label: 'Spacious' }
                  ]}
                />
              </div>

              <div className="settings-two">
                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Motion</strong>
                    <span>Page entrances, card staggering and hover feedback.</span>
                  </div>
                  <Toggle
                    label="Interface motion"
                    checked={settings.motion}
                    onChange={(value) => void setSettings({ motion: value })}
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Compact sidebar</strong>
                    <span>More room for the library.</span>
                  </div>
                  <Toggle
                    label="Compact sidebar"
                    checked={settings.sidebarCompact}
                    onChange={(value) => void setSettings({ sidebarCompact: value })}
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Card playtime</strong>
                    <span>Show tracked playtime on instance cards.</span>
                  </div>
                  <Toggle
                    label="Show card playtime"
                    checked={settings.showCardPlaytime}
                    onChange={(value) => void setSettings({ showCardPlaytime: value })}
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Window backdrop</strong>
                    <span>
                      {windowsDesktopBlur
                        ? 'Acrylic blurs your desktop behind the window on Windows 11.'
                        : 'Desktop blur needs Windows 11 22H2 or newer.'}
                    </span>
                  </div>
                  <Segmented<WallpaperMode>
                    value={settings.wallpaper}
                    onChange={(value) => void setSettings({ wallpaper: value })}
                    options={[
                      { value: 'aurora', label: 'Aurora' },
                      { value: 'system', label: 'Desktop' }
                    ]}
                  />
                </div>
              </div>
            </Section>

            <Section
              icon={<Globe2 size={18} />}
              title={t('settings.language')}
              description={t('settings.languageHint')}
            >
              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>{t('common.language')}</strong>
                  <span>Core navigation, settings and common actions are translated.</span>
                </div>
                <select
                  className="input select language-select"
                  value={settings.language}
                  aria-label={t('common.language')}
                  onChange={(event) =>
                    void setSettings({ language: event.target.value as LanguageCode })
                  }
                >
                  {LANGUAGES.map((language) => (
                    <option key={language.value} value={language.value}>
                      {language.native} · {language.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Launch with Windows</strong>
                  <span>Start Triad when you sign in to Windows.</span>
                </div>
                <Toggle
                  label="Launch on startup"
                  checked={settings.launchOnStartup}
                  onChange={(value) => void setSettings({ launchOnStartup: value })}
                />
              </div>
            </Section>
          </>
        )}

        {tab === 'gameplay' && (
          <>
            <div className="settings-columns">
              <Section
                icon={<UserRound size={18} />}
                title="Account"
                description="Microsoft for online play, offline for singleplayer."
              >
                {account ? (
                  <div className="account-settings">
                    <div className="account-settings-profile">
                      <SkinAvatar account={account} size={48} />
                      <div>
                        <strong>{account.name}</strong>
                        <span>{account.type === 'microsoft' ? 'Microsoft account' : 'Offline profile'}</span>
                        <span className="mono tiny">{account.uuid}</span>
                      </div>
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => setAccountOpen(true)}>
                      Manage account
                    </button>
                  </div>
                ) : (
                  <div className="account-settings">
                    <div className="account-settings-profile">
                      <SkinAvatar account={null} size={48} />
                      <div>
                        <strong>No profile yet</strong>
                        <span>You need a profile before launching the game.</span>
                      </div>
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setAccountOpen(true)}>
                      Add account
                    </button>
                  </div>
                )}
                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Minimize on launch</strong>
                    <span>Tuck the launcher away once Minecraft opens.</span>
                  </div>
                  <Toggle
                    label="Minimize launcher"
                    checked={settings.closeOnLaunch}
                    onChange={(value) => void setSettings({ closeOnLaunch: value })}
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Delete confirmations</strong>
                    <span>Ask before removing an instance or a mod.</span>
                  </div>
                  <Toggle
                    label="Confirm destructive actions"
                    checked={settings.confirmDelete}
                    onChange={(value) => void setSettings({ confirmDelete: value })}
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Skin studio</strong>
                    <span>Paint a local skin and cape, then keep them with your profile.</span>
                  </div>
                  <div className="skin-preview-actions">
                    {skins.skin && <img className="skin-tiny-preview" src={skins.skin} alt="" />}
                    <button type="button" className="btn btn-sm" onClick={() => setSkinStudioOpen(true)}>
                      <Brush size={13} /> Open studio
                    </button>
                  </div>
                </div>
              </Section>

              <Section
                icon={<Cpu size={18} />}
                title="Java & performance"
                description="Runtimes on this computer. Triad downloads one automatically when a version needs it."
                actions={
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={javaLoading}
                    onClick={() => void scanJava(true)}
                  >
                    {javaLoading ? <Spinner size={13} /> : <RefreshCw size={13} />} Rescan
                  </button>
                }
              >
                <div className="java-list">
                  <button
                    type="button"
                    className={cn('java-option', !settings.javaPath && 'active')}
                    onClick={() => void setSettings({ javaPath: '' })}
                  >
                    <span className="java-mark">{!settings.javaPath && <Check size={12} />}</span>
                    <span className="java-option-copy">
                      <strong>Automatic</strong>
                      <span>Pick the best compatible runtime for each game version.</span>
                    </span>
                  </button>
                  {javas.map((java) => (
                    <button
                      key={java.path}
                      type="button"
                      className={cn('java-option', settings.javaPath === java.path && 'active')}
                      onClick={() => void setSettings({ javaPath: java.path })}
                      title={java.path}
                    >
                      <span className="java-mark">
                        {settings.javaPath === java.path && <Check size={12} />}
                      </span>
                      <span className="java-option-copy">
                        <strong>Java {java.major}</strong>
                        <span className="mono">{java.path}</span>
                      </span>
                      <span className="java-version">{java.version}</span>
                    </button>
                  ))}
                  {!javaLoading && javas.length === 0 && (
                    <div className="java-empty">
                      <p>No Java runtime was found yet. Download one now, or let Triad fetch it on first launch.</p>
                      <div className="java-empty-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={javaInstalling}
                          onClick={() => void installJava()}
                        >
                          {javaInstalling ? <Spinner size={12} /> : <Download size={12} />} Install Java 21
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => void api.app.openExternal('https://adoptium.net/temurin/releases/')}
                        >
                          <ExternalLink size={12} /> Get Java
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Default memory</strong>
                    <span>{settings.memoryMb} MB for new instances</span>
                  </div>
                  <Slider
                    value={settings.memoryMb}
                    min={1024}
                    max={16384}
                    step={512}
                    display={String(settings.memoryMb)}
                    suffix="MB"
                    onChange={(value) => void setSettings({ memoryMb: value })}
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Memory saver</strong>
                    <span>Software rendering and lighter effects keep Triad lean. Restart to apply.</span>
                  </div>
                  <Toggle
                    label="Memory saver"
                    checked={settings.memorySaver}
                    onChange={(value) => {
                      void setSettings({ memorySaver: value })
                      pushToast({
                        title: value ? 'Memory saver enabled' : 'Memory saver disabled',
                        description: 'Restart Triad to apply the graphics change.'
                      })
                    }}
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Potato graphics</strong>
                    <span>
                      {settings.potatoGraphics
                        ? `${potatoLevelLabel(potato.level)} · ${potato.renderDistance} chunk render distance, ${potatoParticles}, no clouds or smooth lighting. Applied every time you press Play.`
                        : 'Max-FPS video preset: lower chunk render distance, fewer particles, no clouds, shadows or smooth lighting. Applied every time you press Play.'}
                    </span>
                  </div>
                  <Toggle
                    label="Potato graphics"
                    checked={settings.potatoGraphics}
                    onChange={(value) => void setSettings({ potatoGraphics: value })}
                  />
                </div>
                <div className={cn('settings-row column', !settings.potatoGraphics && 'is-disabled')}>
                  <div className="settings-row-label">
                    <strong>Potato intensity</strong>
                    <span>
                      {settings.potatoGraphics
                        ? `How aggressive the preset is. ${potatoLevelLabel(potato.level)} keeps ${potato.renderDistance} chunks, ${potato.simulationDistance} simulation chunks and ${potato.mipmapLevels} mipmap levels.`
                        : 'Turn on Potato graphics to choose how much it dials back.'}
                    </span>
                  </div>
                  <Slider
                    value={settings.potatoGraphicsLevel}
                    min={POTATO_MIN_LEVEL}
                    max={POTATO_MAX_LEVEL}
                    step={5}
                    display={String(settings.potatoGraphicsLevel)}
                    suffix="%"
                    disabled={!settings.potatoGraphics}
                    onChange={(value) => void setSettings({ potatoGraphicsLevel: value })}
                  />
                </div>
                <div className="settings-row">
                  <div className="settings-row-label">
                    <strong>Show snapshots</strong>
                    <span>Include experimental versions when creating an instance.</span>
                  </div>
                  <Toggle
                    label="Show snapshots"
                    checked={settings.showSnapshots}
                    onChange={(value) => void setSettings({ showSnapshots: value })}
                  />
                </div>
              </Section>
            </div>

            <Section
              icon={<MessageCircle size={18} />}
              title="Discord presence"
              description="Share what you are playing with friends on Discord."
              actions={
                <Chip tone={settings.discordPresence ? 'ok' : 'muted'}>
                  {settings.discordPresence ? 'Visible' : 'Hidden'}
                </Chip>
              }
            >
              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Rich Presence</strong>
                  <span>Show your Minecraft version, world or server on your Discord profile.</span>
                </div>
                <Toggle
                  label="Discord Rich Presence"
                  checked={settings.discordPresence}
                  onChange={(value) => void setSettings({ discordPresence: value })}
                />
              </div>
              <div className={cn('settings-row', !settings.discordPresence && 'is-disabled')}>
                <div className="settings-row-label">
                  <strong>Hide server address</strong>
                  <span>Show that you are in multiplayer without sharing the server address.</span>
                </div>
                <Toggle
                  label="Hide server address in Discord"
                  checked={settings.discordHideServerAddress}
                  disabled={!settings.discordPresence}
                  onChange={(value) =>
                    void setSettings({ discordHideServerAddress: value })
                  }
                />
              </div>
            </Section>
          </>
        )}

        {tab === 'downloads' && (
          <>
            <Section
              icon={<DownloadCloud size={18} />}
              title={t('downloads.auto')}
              description="Keep game files ready and optionally pull mod updates in the background."
              actions={
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={autoRunning || autoStatus?.running}
                  onClick={() => void runAuto()}
                >
                  {autoRunning || autoStatus?.running ? <Spinner size={13} /> : <RefreshCw size={13} />}
                  {autoRunning || autoStatus?.running ? 'Checking…' : t('downloads.runNow')}
                </button>
              }
            >
              <div className="auto-downloader-card">
                <div className="auto-downloader-orbit">
                  <DownloadCloud size={28} />
                </div>
                <div className="auto-downloader-copy">
                  <strong>{autoStatus?.running ? 'Working in the background' : 'Idle and ready'}</strong>
                  <span>{autoStatus?.message ?? 'Checks instances for missing files.'}</span>
                  <span className="muted small">
                    {autoStatus?.lastRun
                      ? `Last run ${new Date(autoStatus.lastRun).toLocaleString()}`
                      : 'No automatic run yet'}
                    {autoStatus?.nextRun
                      ? ` · next ${new Date(autoStatus.nextRun).toLocaleTimeString()}`
                      : ''}
                  </span>
                </div>
                <span className={cn('auto-status-dot', autoStatus?.running && 'active')} />
              </div>

              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Download missing game files</strong>
                  <span>Prepare instances in the background so Play is ready.</span>
                </div>
                <Toggle
                  label="Auto-download game files"
                  checked={settings.autoDownload}
                  onChange={(value) => {
                    void setSettings({ autoDownload: value })
                    window.setTimeout(() => void refreshAuto(), 250)
                  }}
                />
              </div>
              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Auto-update mods</strong>
                  <span>Check compatible updates and queue them automatically.</span>
                </div>
                <Toggle
                  label="Auto-update mods"
                  checked={settings.autoUpdateMods}
                  onChange={(value) => {
                    void setSettings({ autoUpdateMods: value })
                    window.setTimeout(() => void refreshAuto(), 250)
                  }}
                />
              </div>
              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Background checks</strong>
                  <span>Triad checks every six hours while it is open.</span>
                </div>
                <Chip tone="muted">6 hours</Chip>
              </div>
            </Section>

            <Section icon={<Download size={18} />} title="Activity" description="Current and recent downloads.">
              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Download centre</strong>
                  <span>Open the live queue for installs, modpacks and updates.</span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => useApp.getState().navigate('downloads')}
                >
                  <Download size={13} /> Open downloads
                </button>
              </div>
              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Storage</strong>
                  <span>Game files, mods, worlds and caches all live in one place.</span>
                </div>
                <div className="inline-field">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => appInfo && void api.app.openPath(appInfo.userData)}
                  >
                    <HardDrive size={13} /> Open data
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => appInfo && void api.app.openPath(appInfo.instancesDir)}
                  >
                    <FolderOpen size={13} /> Instances
                  </button>
                </div>
              </div>
            </Section>
          </>
        )}

        {tab === 'advanced' && (
          <>
            <Section
              icon={<LayoutPanelTop size={18} />}
              title="Launcher"
              description="Data, updates and the tools under the hood."
            >
              <div className="settings-row column">
                <div className="settings-row-label">
                  <strong>Microsoft client ID</strong>
                  <span>
                    Defaults to the public Minecraft launcher app. Use your own Azure application if you have one.
                  </span>
                </div>
                <div className="inline-field">
                  <input
                    className="input mono"
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={!clientIdDirty || clientId.trim().length < 10}
                    onClick={() => {
                      void setSettings({ clientId: clientId.trim() })
                      pushToast({ title: 'Client ID saved', description: 'Used for new sign-ins.' })
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={clientId === DEFAULT_SETTINGS.clientId}
                    onClick={() => {
                      setClientId(DEFAULT_SETTINGS.clientId)
                      void setSettings({ clientId: DEFAULT_SETTINGS.clientId })
                      pushToast({
                        title: 'Using the public client ID',
                        description: 'The default Minecraft launcher app will be used for new sign-ins.'
                      })
                    }}
                  >
                    Use default
                  </button>
                </div>
                <p className="field-hint">
                  Device-code sign-in opens Microsoft in your browser. Tokens stay on this computer.
                </p>
              </div>

              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Kept across reinstalls</strong>
                  <span>
                    Your account, settings, instances, mods and worlds stay in the launcher data folder
                    when you update or reinstall Triad. A backup copy is kept there too.
                  </span>
                </div>
                <Chip tone="muted">Saved</Chip>
              </div>

              <div className="settings-two">
                <button
                  type="button"
                  className="path-button"
                  onClick={() => appInfo && void api.app.openPath(appInfo.userData)}
                >
                  <HardDrive size={16} />
                  <span>
                    <strong>Launcher data</strong>
                    <span className="mono">{appInfo?.userData ?? '—'}</span>
                  </span>
                  <FolderOpen size={15} />
                </button>
                <button
                  type="button"
                  className="path-button"
                  onClick={() => appInfo && void api.app.openPath(appInfo.instancesDir)}
                >
                  <FolderOpen size={16} />
                  <span>
                    <strong>Instances folder</strong>
                    <span className="mono">{appInfo?.instancesDir ?? '—'}</span>
                  </span>
                  <FolderOpen size={15} />
                </button>
              </div>

              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Restart launcher</strong>
                  <span>Useful after updating Triad.</span>
                </div>
                <button type="button" className="btn btn-sm" onClick={() => void api.app.relaunch()}>
                  <Rocket size={13} /> Relaunch
                </button>
              </div>
            </Section>

            <Section
              icon={<RefreshCw size={18} />}
              title="Launcher updates"
              description="Triad checks for a new build when it opens, when you return to the window, and every 15 minutes. You choose when to download it, then restart to finish installing."
            >
              <div className="auto-downloader-card update-card">
                <div className="auto-downloader-orbit">
                  {updateBusy ? <Spinner size={24} /> : <RefreshCw size={24} />}
                </div>
                <div className="auto-downloader-copy">
                  <strong>{updateTitle}</strong>
                  <span>{updateStatus?.message ?? 'Updates are checked automatically.'}</span>
                  <span className="muted small">
                    {updateStatus?.version ? `Version ${updateStatus.version}` : `Installed ${appInfo?.version ?? '—'}`}
                    {updateStatus?.percent !== undefined ? ` · ${Math.round(updateStatus.percent)}%` : ''}
                  </span>
                </div>
                {updateReady ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => void installUpdate()}
                  >
                    <Rocket size={13} /> Restart & install
                  </button>
                ) : updateAvailable ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => void downloadUpdate()}
                  >
                    <DownloadCloud size={13} /> Download update
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={updateBusy || updateDisabled}
                    onClick={() => void checkForUpdates()}
                  >
                    {updateBusy ? <Spinner size={13} /> : <RefreshCw size={13} />}
                    {updateBusy
                      ? updateStatus?.phase === 'downloading'
                        ? 'Downloading…'
                        : 'Checking…'
                      : updateStatus?.phase === 'error'
                        ? 'Try again'
                        : 'Check for updates'}
                  </button>
                )}
              </div>
              <div className="settings-row">
                <div className="settings-row-label">
                  <strong>Patch notes</strong>
                  <span>A short summary appears once after each launcher update.</span>
                </div>
                <Chip tone="muted">Shown once</Chip>
              </div>
            </Section>

            <Glass className="about-card">
              <div className="about-mark">G</div>
              <div>
                <strong>Triad</strong>
                <span>
                  A liquid-glass Minecraft launcher with built-in mod browsing. Built with Electron and React.
                </span>
              </div>
              <div className="about-meta">
                <span>
                  <Monitor size={12} /> {appInfo?.platform ?? '—'}
                </span>
                <span>
                  <Info size={12} /> v{appInfo?.version ?? '1.0.0'}
                </span>
              </div>
            </Glass>
          </>
        )}
      </div>
    </div>
  )
}

function SettingsTabButton({
  id,
  label,
  icon,
  tab,
  setTab
}: {
  id: SettingsTab
  label: string
  icon: React.ReactNode
  tab: SettingsTab
  setTab: (tab: SettingsTab) => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      className={cn('settings-tab', tab === id && 'active')}
      onClick={() => setTab(id)}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function Section({
  icon,
  title,
  description,
  actions,
  children
}: {
  icon: React.ReactNode
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Glass className="settings-card">
      <header className="settings-head">
        <div className="settings-icon">{icon}</div>
        <div className="settings-head-copy">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="settings-actions">{actions}</div>}
      </header>
      <div className="settings-body">{children}</div>
    </Glass>
  )
}
