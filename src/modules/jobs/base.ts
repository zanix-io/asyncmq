import type { BaseJob, JobProcess } from 'typings/jobs.ts'

import { registerTask } from 'utils/tasks.ts'

// deno-lint-ignore no-explicit-any
export const getRegisterBaseJobData = <J extends JobProcess<any> & BaseJob>(
  job: J,
) => {
  const { name, processingQueue, handler, customQueue, ...jobDef } = job

  const queue = processingQueue ? `zanix.worker.${processingQueue}` : customQueue

  if (handler) {
    job.args = { $args: job.args, $taskId: registerTask(name, handler) }
  }

  return {
    name,
    jobDef: { ...jobDef, queue, args: job.args },
  }
}
