import { Client, type SetActivity } from '@xhayper/discord-rpc'

// Rich Presence is a local, client-side Discord feature. It only needs the
// application's public client ID; bot tokens and OAuth client secrets must
// never be embedded in a distributed launcher.
const DISCORD_CLIENT_ID = '1571487897599873195'
const RETRY_DELAY_MS = 15_000

export interface PresenceActivity {
  details: string
  state: string
  startTimestamp: number
}

export class DiscordPresence {
  private client: Client | null = null
  private activity: PresenceActivity | null = null
  private ready = false
  private connecting = false
  private stopped = true
  private retryTimer: NodeJS.Timeout | null = null
  private lastKey = ''

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    void this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    const client = this.client
    this.client = null
    this.ready = false
    this.connecting = false
    this.lastKey = ''
    void client?.destroy().catch(() => undefined)
  }

  setActivity(activity: PresenceActivity | null): void {
    this.activity = activity
    this.apply()
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting || this.client) return
    this.connecting = true
    const client = new Client({ clientId: DISCORD_CLIENT_ID })
    this.client = client

    client.on('ready', () => {
      if (this.client !== client || this.stopped) return
      this.ready = true
      this.connecting = false
      this.lastKey = ''
      this.apply()
    })

    client.on('disconnected', () => {
      if (this.client !== client) return
      this.client = null
      this.ready = false
      this.connecting = false
      this.lastKey = ''
      if (!this.stopped) this.schedule()
    })

    try {
      await client.login()
      if (this.client === client && !this.stopped) {
        this.ready = true
        this.connecting = false
        this.apply()
      }
    } catch {
      if (this.client === client) {
        this.client = null
        this.ready = false
        this.connecting = false
        this.lastKey = ''
        await client.destroy().catch(() => undefined)
        if (!this.stopped) this.schedule()
      }
    }
  }

  private schedule(): void {
    if (this.stopped || this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, RETRY_DELAY_MS)
    this.retryTimer.unref()
  }

  private apply(): void {
    const client = this.client
    if (!this.ready || !client?.user) return

    if (!this.activity) {
      if (!this.lastKey) return
      this.lastKey = ''
      void client.user.clearActivity().catch(() => undefined)
      return
    }

    const key = `${this.activity.details}\n${this.activity.state}\n${this.activity.startTimestamp}`
    if (key === this.lastKey) return
    this.lastKey = key

    const activity: SetActivity = {
      details: this.activity.details,
      state: this.activity.state,
      startTimestamp: this.activity.startTimestamp
    }
    void client.user.setActivity(activity).catch(() => {
      this.lastKey = ''
    })
  }
}
