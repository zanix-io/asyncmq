import type { Execution } from 'typings/queues.ts'

export const SUBSCRIBERS_METADATA_KEY: Record<Execution, string> = {
  'main-process': 'zanix:asyncmq-subscribers-in-process',
  'extra-process': 'zanix:asyncmq-subscribers-out-of-process',
}

export const CRONS_METADATA_KEY: Record<Execution, string> = {
  'main-process': 'zanix:asyncmq-crons-in-process',
  'extra-process': 'zanix:asyncmq-crons-out-of-process',
}

export const JOBS_METADATA_KEY = 'zanix:asyncmq-jobs'
export const TASKS_METADATA_KEY = 'zanix:asyncmq-tasks'

export const GLOBAL_EXCHANGE = 'zanix.amqp'
export const DEADLETTER_EXCHANGE = 'zanix.amqp.dlx'
export const SCHEDULER_EXCHANGE = 'zanix.amqp.schx'

export const MESSAGE_HEADERS = {
  context: 'x-znx-context',
  rqFromDL: 'x-znx-requeued-from-deadletter',
  maxRetries: 'x-znx-max-retries',
  backoffOptions: 'x-znx-backoff-options',
  cronIdentifier: 'x-znx-cron-identifier',
}

export const QUEUE_PRIORITY = {
  low: 0,
  medium: 5,
  high: 10,
}
