import type { ProcessorOptions } from 'typings/worker.ts'
import type { Job } from 'typings/jobs.ts'

import { ProgramModule } from '@zanix/server'

import { getTask } from 'utils/tasks.ts'

/**
 * Executes a single registered task by `taskId`, resolving its handler from the calling thread's
 * own registry. This is the function the internal-process worker-thread bootstrap module
 * (registered via `setTaskerUrl`) exports as `processor` for `@zanix/workers`' `WorkerManager` to
 * invoke on each dispatched message.
 */
export const processor = (options: ProcessorOptions): Promise<unknown> | unknown => {
  const { taskId, queue, context, attempt, args } = options

  const task: Job<typeof args> = getTask(taskId, queue)
  context.queue = queue
  context.attempt = attempt

  return task.call({
    providers: ProgramModule.getProviders(context.id),
    connectors: ProgramModule.getConnectors(context.id),
    interactors: ProgramModule.getInteractors(context.id),
    context,
  }, args)
}
