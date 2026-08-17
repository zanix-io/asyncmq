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
export const processor = (
  options: ProcessorOptions,
): Promise<unknown> | unknown => {
  const { taskId, queue, context, attempt, args } = options

  const task: Job<typeof args> = getTask(taskId, queue)
  context.queue = queue
  context.attempt = attempt

  // Runtime errors retrieved by `getInteractors`, `getConnectors`, and `getProviders`
  // are handled with `verbose` disabled. The worker captures execution errors
  // and forwards them to the framework's centralized error handler, which is responsible for
  // logging and reporting. Enabling `verbose` here would produce duplicate logs.
  return task.call({
    providers: ProgramModule.getProviders(context.id, false),
    connectors: ProgramModule.getConnectors(context.id, false),
    interactors: ProgramModule.getInteractors(context.id, false),
    context,
  }, args)
}
