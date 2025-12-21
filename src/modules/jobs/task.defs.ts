import type { JobDefinition, JobRegistry } from 'typings/jobs.ts'

import { type MessageQueue, ProgramModule } from '@zanix/server'
import { JOBS_METADATA_KEY } from 'utils/constants.ts'
import { InternalError } from '@zanix/errors'
import { douplicatesErrorInfo } from 'utils/jobs.ts'
import { getRegisterBaseJobData } from './base.ts'

/**
 * Registers a job definition in the global program registry.
 *
 * This function ensures that each job name is unique across the system.
 * If a job with the same name has already been registered, an error is thrown
 * to prevent accidental overrides or ambiguous job execution.
 *
 * A job must be executed using the current `Worker Provider`
 * (e.g., `this.worker.runJob`, `this.worker.runTask`).
 *
 * @param {JobDefinition} job
 * The job definition to register. The `name` property is used as the unique identifier.
 *
 * @throws {InternalError}
 * Thrown when a job with the same name is already registered in the system.
 *
 * @example
 * ```ts
 * registerJob({
 *   name: 'send-email',
 *   weight: 'light',
 *   process: async (payload) => {
 *     // ...
 *   },
 * })
 * ```
 */
export function registerJob<A extends MessageQueue, T>(
  job: JobDefinition<A, T>,
): void {
  const { name, jobDef } = getRegisterBaseJobData(job)
  const jobs = ProgramModule.registry.get<JobRegistry>(JOBS_METADATA_KEY) || {}

  if (jobs[name]) {
    throw new InternalError(
      `Job registration failed: A job with the name "${name}" is already registered.`,
      douplicatesErrorInfo(name),
    )
  }

  jobs[name] = jobDef

  ProgramModule.registry.set(JOBS_METADATA_KEY, jobs)
}
