import type { BaseJob, JobProcess } from 'typings/jobs.ts'
import type { Execution, SubscriberMetadata } from 'typings/queues.ts'

import { SUBSCRIBERS_METADATA_KEY } from 'utils/constants.ts'
import { ProgramModule } from '@zanix/server'
import { InternalError } from '@zanix/errors'
import { registerTask } from 'utils/tasks.ts'

// deno-lint-ignore no-explicit-any
export const getRegisterBaseJobData = <J extends JobProcess<any> & BaseJob>(
  job: J,
) => {
  const { name, processingQueue, handler, customQueue, ...jobDef } = job

  let queue: string

  if (processingQueue) {
    queue = `zanix.worker.${processingQueue}`
  } else {
    const inProcessQueues =
      ProgramModule.registry.get<SubscriberMetadata[]>(SUBSCRIBERS_METADATA_KEY['main-process']) ||
      []
    const outOfProcessQueues = ProgramModule.registry.get<SubscriberMetadata[]>(
      SUBSCRIBERS_METADATA_KEY['extra-process'],
    ) ||
      []

    queue = customQueue

    const exists = processingQueue ? true : inProcessQueues.find((q) => q[0] === queue) ||
      outOfProcessQueues.find((q) => q[0] === queue)

    if (!exists) {
      throw new InternalError(
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
  }

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
