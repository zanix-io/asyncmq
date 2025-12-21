import logger from '@zanix/logger'
import { ProgramModule } from '@zanix/server'
import type { BaseJob, JobProcess } from 'typings/jobs.ts'
import type { Execution, SubscriberMetadata } from 'typings/queues.ts'

import { registerTask } from 'utils/tasks.ts'
import { SUBSCRIBERS_METADATA_KEY } from 'utils/constants.ts'

// deno-lint-ignore no-explicit-any
export const getRegisterBaseJobData = <J extends JobProcess<any> & BaseJob>(
  job: J,
) => {
  const { name, processingQueue, handler, customQueue, ...jobDef } = job

  const queue = processingQueue ? `zanix.worker.${processingQueue}` : customQueue

  setTimeout(() => {
    const inProcessQueues =
      ProgramModule.registry.get<SubscriberMetadata[]>(SUBSCRIBERS_METADATA_KEY['main-process']) ||
      []
    const outOfProcessQueues = ProgramModule.registry.get<SubscriberMetadata[]>(
      SUBSCRIBERS_METADATA_KEY['extra-process'],
    ) ||
      []

    const exists = inProcessQueues.find((q) => q[0] === queue) ||
      outOfProcessQueues.find((q) => q[0] === queue)

    if (!exists) {
      logger.error(
        `The specified queue '${queue}' does not exist or is not properly configured.`,
        {
          meta: {
            jobName: name,
            queue,
            hint:
              'Ensure the queue is registered in the system and that the configuration matches the expected format.',
          },
        },
      )
    }
  }, 500)

  let execution: Execution = 'main-process'
  if (handler) {
    job.args = { $args: job.args, $taskId: registerTask(name, handler) }
    execution = 'extra-process'
  }

  return {
    name,
    execution,
    jobDef: { ...jobDef, queue, args: job.args },
  }
}
