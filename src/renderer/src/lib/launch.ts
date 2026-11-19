import { api, errorMessage } from '../api'
import { useApp } from '../store'

export function playInstance(instanceId: string, server?: string, world?: string): void {
  const state = useApp.getState()
  if (state.launch.status === 'preparing' || state.launch.status === 'running') {
    state.pushToast({
      title: 'Minecraft is already running',
      description: 'Stop the current game before launching another instance.',
      variant: 'error'
    })
    return
  }
  if (!state.account) {
    state.pushToast({
      title: 'Choose a profile first',
      description: 'Sign in with Microsoft or create an offline profile to play.',
      variant: 'error'
    })
    state.setAccountOpen(true)
    return
  }
  state.setActiveInstance(instanceId)
  void api.launch.start(instanceId, server, world).catch((error) => {
    state.pushToast({
      title: 'Could not launch Minecraft',
      description: errorMessage(error),
      variant: 'error'
    })
  })
}

export function stopGame(): void {
  void api.launch.stop()
}
