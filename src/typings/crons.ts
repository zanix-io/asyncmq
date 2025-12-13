import type { QueueMessageOptions } from '@zanix/server'

/**
 * Defines the structure of a cron job configuration.
 */
export type CronJobDefinition = {
  /** Cron name (unique identifier) */
  name: string
  /** Indicates whether the cron job is active or not. */
  isActive: boolean
  /** Arguments to pass to the cron job. It can be a string or an object with unknown keys and values. */
  args: string | Record<string, unknown>
  /** The name of the **internal** queue responsible for executing the cron job. */
  queue: string
  /**
   * Cron expression used to define the schedule for task execution, including seconds.
   * The cron expression follows the extended format of 6 fields:
   * `second` `minute` `hour` `day of the month` `month` `day of the week`.
   *
   * Example of a valid cron expression: `* * * * * *` (executes every second).
   */
  schedule: `${string} ${string} ${string} ${string} ${string} ${string}`
  /** Additional options for the queue message. 'contextId' is omitted from QueueMessageOptions. */
  settings?: Omit<QueueMessageOptions, 'contextId' | 'isInternal'>
}

/**
 * A registry of cron jobs, where the key is a unique identifier and the value is a cron job configuration.
 */
export type CronRegistry = [string, CronJobDefinition]
