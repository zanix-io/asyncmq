import type { TasksRegistry } from 'typings/worker.ts'
import type { Job } from 'typings/jobs.ts'

import { type MessageQueue, ProgramModule } from '@zanix/server'
import { TASKS_METADATA_KEY } from 'utils/constants.ts'
import { InternalError } from '@zanix/errors'

export const registerTask = <A extends MessageQueue, T>(jobId: string, task: Job<A, T>) => {
  const tasks = ProgramModule.registry.get<TasksRegistry<A, T>>(TASKS_METADATA_KEY) || {}
  const taskId = `${jobId}.handler`
  tasks[taskId] = task

  ProgramModule.registry.set(TASKS_METADATA_KEY, tasks)

  return taskId
}

export const getTask = <A extends MessageQueue, T>(taskId: string, queue: string) => {
  const tasks = ProgramModule.registry.get<TasksRegistry<A, T>>(TASKS_METADATA_KEY)
  const task = tasks?.[taskId]
  if (task) return task

  throw new InternalError(`Tasker not found on queue "${queue}"`, {
    meta: { taskId, source: 'zanix', method: 'WorkerTaskerRegistry' },
  })
}
