export const QUEUES_METADATA_KEY = 'zanix:asyncmq-queues'
export const CRONS_METADATA_KEY = 'zanix:asyncmq-queues-crons'

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
