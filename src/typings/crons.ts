import type { MessageQueue } from '@zanix/server'
import type { BaseJob, JobProcess } from './jobs.ts'

export type CronJobDefinitionBase<A extends MessageQueue = MessageQueue> = BaseJob<A> & {
  /** Indicates whether the cron job is active or not. */
  isActive: boolean
  /**
   * Cron expression used to define the schedule for task execution, including seconds.
   * The cron expression follows the extended format of 6 fields:
   * `second` `minute` `hour` `day of the month` `month` `day of the week`.
   *
   * Example of a valid cron expression: `* * * * * *` (executes every second).
   */
  schedule: `${string} ${string} ${string} ${string} ${string} ${string}`
}

/**
 * Defines the structure of a cron job configuration.
 */
export type CronJobDefinition<A extends MessageQueue, T> =
  & CronJobDefinitionBase<A>
  & JobProcess<A, T>

/**
 * Defines the structure of a normalized cron job configuration.
 */
export type CronJobDefinitionNormalized = CronJobDefinitionBase & { queue: string }

/**
 * A registry of cron jobs, where the key is a unique identifier and the value is a cron job configuration.
 */
export type CronRegistry = [string, Omit<CronJobDefinitionNormalized, 'name'>]
