import type { ProcessorOptions } from 'typings/worker.ts'
import type { Job } from 'typings/jobs.ts'

import { ProgramModule } from '@zanix/server'

import { getTask } from 'utils/tasks.ts'

export const processor = (options: ProcessorOptions) => {
  const { taskId, queue, context, args } = options

  const task: Job<typeof args> = getTask(taskId, queue)
  context.queue = queue

  return task.call({
    providers: ProgramModule.getProviders(context.id),
    connectors: ProgramModule.getConnectors(context.id),
    interactors: ProgramModule.getInteractors(context.id),
    context,
  }, args)
}
