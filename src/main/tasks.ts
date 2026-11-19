import type { TaskKind, TaskState } from '@shared/types'
import { events } from './events'
import { uid } from './util'

export interface TaskHandle {
  id: string
  signal: AbortSignal
  update: (progress: number | null, stage?: string) => void
  subtitle: (text: string) => void
  setTitle: (text: string) => void
  done: (data?: TaskState['data']) => void
  fail: (error: unknown) => void
}

export class TaskManager {
  private tasks = new Map<string, TaskState>()
  private controllers = new Map<string, AbortController>()
  private lastEmit = new Map<string, number>()

  create(title: string, kind: TaskKind = 'install', subtitle?: string): TaskHandle {
    const id = uid('task_')
    const controller = new AbortController()
    this.controllers.set(id, controller)
    const task: TaskState = {
      id,
      title,
      subtitle,
      kind,
      status: 'running',
      progress: null,
      stage: 'Starting',
      startedAt: Date.now()
    }
    this.tasks.set(id, task)
    this.emit(task, true)

    const update = (state: Partial<TaskState>, force = false): void => {
      const existing = this.tasks.get(id)
      if (!existing || existing.status !== 'running') return
      Object.assign(existing, state)
      this.emit(existing, force)
    }

    return {
      id,
      signal: controller.signal,
      update: (progress, stage) => {
        update({ progress: progress === null ? null : Math.max(0, Math.min(1, progress)), stage })
      },
      subtitle: (text) => update({ subtitle: text }),
      setTitle: (text) => update({ title: text }),
      done: (data) => {
        update({ status: 'done', progress: 1, stage: 'Complete', finishedAt: Date.now(), data }, true)
        this.controllers.delete(id)
      },
      fail: (error) => {
        const message =
          error instanceof Error ? error.message : typeof error === 'string' ? error : 'Something went wrong'
        update(
          { status: 'error', error: message, finishedAt: Date.now(), stage: 'Failed', progress: null },
          true
        )
        this.controllers.delete(id)
      }
    }
  }

  private emit(task: TaskState, force = false): void {
    const now = Date.now()
    const last = this.lastEmit.get(task.id) ?? 0
    if (!force && now - last < 120) {
      return
    }
    this.lastEmit.set(task.id, now)
    events.task({ ...task })
  }

  list(): TaskState[] {
    return [...this.tasks.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  cancel(id: string): void {
    const controller = this.controllers.get(id)
    if (!controller) return
    controller.abort()
    this.controllers.delete(id)
    const task = this.tasks.get(id)
    if (task && task.status === 'running') {
      task.status = 'cancelled'
      task.stage = 'Cancelled'
      task.finishedAt = Date.now()
      task.progress = null
      this.emit(task, true)
    }
  }

  cancelAll(): void {
    for (const id of [...this.controllers.keys()]) this.cancel(id)
  }

  dismiss(id: string): void {
    const task = this.tasks.get(id)
    if (task?.status === 'running') return
    this.tasks.delete(id)
    this.lastEmit.delete(id)
  }
}
