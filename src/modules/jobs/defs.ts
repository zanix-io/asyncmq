import type { CronJobDefinition, CronRegistry } from 'typings/crons.ts'

import { ProgramModule } from '@zanix/server'
import { CRONS_METADATA_KEY } from 'utils/constants.ts'
import { InternalError } from '@zanix/errors'

/**
 * Registers a cron job based on the provided Domain-Specific Language (DLS) cron definition.
 * This function schedules a task based on the cron expression and related settings, using a custom DLS format.
 *
 * @param {CronDefinition} job - The cron definition object containing all the necessary details for the cron job.
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
export function registerCronJob(
  job: CronJobDefinition,
): void {
  const cronJobs = ProgramModule.registry.get<CronRegistry[]>(CRONS_METADATA_KEY) || []

  const exist = cronJobs.find((registeredCron) => registeredCron[0] === job.name && registeredCron)

  if (exist) {
    throw new InternalError(
      `Conflict: A Cron with the same name or identifier ("${
        exist[0]
      }") is already configured in the system.`,
      {
        meta: {
          source: 'zanix',
          cronName: exist[0],
          cronDefinition: exist[1],
          errorDetails: {
            message:
              'The specified cron name or identifier already exists, preventing a new configuration with the same identifier.',
          },
        },
      },
    )
  }

  cronJobs.push([job.name, job])

  ProgramModule.registry.set(CRONS_METADATA_KEY, cronJobs)
}
