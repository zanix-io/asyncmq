import type { BaseJob, JobProcess } from 'typings/jobs.ts'
import type { Execution } from 'typings/queues.ts'

import { registerTask } from 'utils/tasks.ts'

// deno-lint-ignore no-explicit-any
export const getRegisterBaseJobData = <J extends JobProcess<any> & BaseJob>(
  job: J,
) => {
  const { name, processingQueue, handler, customQueue, ...jobDef } = job

  const queue = processingQueue ? `zanix.worker.${processingQueue}` : customQueue

  const execution: Execution = Deno.env.get('ZANIX_WORKER_EXECUTION') as Execution || 'main-process'

  if (handler) {
    job.args = { $args: job.args, $taskId: registerTask(name, handler) }
  }

  return {
    name,
    execution,
    jobDef: { ...jobDef, queue, args: job.args },
  }
}
