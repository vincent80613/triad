import type { BrowserWindow } from 'electron'
import type { DataScope, TaskState, LaunchState, Account, AuthState, DeviceCodeInfo, ToastInput, UpdaterStatus, HostedServerState } from '@shared/types'

let target: BrowserWindow | null = null

export function bindWindow(window: BrowserWindow): void {
  target = window
}

export function emit(channel: string, payload: unknown): void {
  if (target && !target.isDestroyed()) {
    target.webContents.send(channel, payload)
  }
}

export const events = {
  task: (task: TaskState) => emit('task:update', task),
  launchState: (state: LaunchState) => emit('launch:state', state),
  launchLog: (instanceId: string, line: string) => emit('launch:log', { instanceId, line }),
  authDevice: (info: DeviceCodeInfo) => emit('auth:device', info),
  authState: (state: AuthState) => emit('auth:state', state),
  account: (account: Account | null) => emit('account:changed', account),
  dataChanged: (scope: DataScope) => emit('data:changed', scope),
  maximized: (value: boolean) => emit('window:maximized', value),
  updater: (status: UpdaterStatus) => emit('updater:status', status),
  toast: (toast: ToastInput) => emit('toast', toast),
  hostState: (state: HostedServerState) => emit('host:state', state),
  hostLog: (payload: { id: string; line: string }) => emit('host:log', payload)
}
