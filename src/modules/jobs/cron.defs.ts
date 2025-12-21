import type { CronJobDefinition, CronRegistry } from 'typings/crons.ts'

import { type MessageQueue, ProgramModule } from '@zanix/server'
import { CRONS_METADATA_KEY } from 'utils/constants.ts'
import { InternalError } from '@zanix/errors'
import { douplicatesErrorInfo } from 'utils/jobs.ts'
import { getRegisterBaseJobData } from './base.ts'

/**
 * Registers a cron job definition in the global program registry.
 * This function schedules a task based on the cron expression and related settings, using a custom DLS format.
 *
 * ⚠️ Note: To run cron jobs, you must enable AsynqMQ by setting the `AMQP_URI` environment variable.
 *
 * @param {CronJobDefinition} job - The cron definition object containing all the necessary details for the cron job.
 *
 * @returns {void} - This function does not return any value.
 *
 * @example
 * // Register a cron job that runs every minute
 * registerCronJob({
 *   name: 'minuteJob',
 *   isActive: true,
 *   args: 'argumentValue',
 *   queue: 'taskQueue',
 *   schedule: '0 *\/1 * * * *',  // every minute
 * });
 */
export function registerCronJob<A extends MessageQueue, T>(
  job: CronJobDefinition<A, T>,
): void {
  const { name, execution, jobDef } = getRegisterBaseJobData(job)

  const cronsMetaKey = CRONS_METADATA_KEY[execution]

  const cronJobs = ProgramModule.registry.get<CronRegistry[]>(cronsMetaKey) || []

  const exist = cronJobs.find((registeredCron) => registeredCron[0] === name)

  if (exist) {
    throw new InternalError(
      `Conflict: A Cron with the same name or identifier ("${
        exist[0]
      }") is already configured in the system.`,
      douplicatesErrorInfo(name),
    )
  }

  cronJobs.push([name, jobDef])

  ProgramModule.registry.set(cronsMetaKey, cronJobs)
}
