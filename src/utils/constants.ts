export const QUEUES_METADATA_KEY = 'zanix:asyncmq-queues'

export const GLOBAL_EXCHANGE = 'zanix.amqp'
export const DEADLETTER_EXCHANGE = 'zanix.amqp.dlx'

export const MESSAGE_HEADERS = {
  context: 'x-znx-context',
  maxRetries: 'x-znx-max-retries',
  backoffOptions: 'x-znx-backoff-options',
}

export const QUEUE_PRIORITY = {
  low: 0,
  medium: 5,
  high: 10,
}
