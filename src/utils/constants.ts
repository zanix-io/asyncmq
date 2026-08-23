import type { Execution } from 'typings/queues.ts'

/** Env var gating RabbitMQ's real connector/provider registration — see `rabbitmq/defs.ts`'s `registerRabbitMQConnector()`. Unset: the `'asyncmq'` core slot exists but has no concrete implementation. */
export const AMQP_URI_ENV = 'AMQP_URI'

/** Env var naming the AES key `ZanixCoreAsyncMQProvider` encrypts message bodies with — see its own constructor. Unset: falls back to a hardcoded, publicly-known default key (logged as a warning). */
export const DATA_AMQP_SECRET_ENV = 'DATA_AMQP_SECRET'

/** Env var naming this process's own execution mode (`WorkerExecution`) — see `worker/mod.ts`'s `isInternalProcess()`/`resolveWorkerExecution()`, the two functions that read it; every other call site should go through one of those rather than reading this literal directly. */
export const ZANIX_WORKER_EXECUTION_ENV = 'ZANIX_WORKER_EXECUTION'

/** Env var selecting Redis (set) vs. the local in-process KV (unset) as the backend for queue-options storage and message-dedup locking — see `utils/queues.ts`. */
export const REDIS_URI_ENV = 'REDIS_URI'

/**
 * The `ProgramModule.registry` key holding registered subscriber metadata for a given
 * {@link Execution} mode. Deliberately keyed by {@link Execution} (2 modes — `'main-process'`/
 * `'extra-process'`), NOT the wider `WorkerExecution` (which also has `'internal-process'`):
 * an internal worker thread reuses `'main-process'`'s bucket rather than getting its own, since
 * that's where `'main-process'`-configured subscribers actually execute when dispatched through
 * `ZanixCoreWorkerProvider.runTask`. Resolve this via `worker/mod.ts`'s `resolveSubscribersMetadataKey`
 * rather than indexing it directly with a `WorkerExecution` value — indexing directly with
 * `'internal-process'` silently returns `undefined`, since this `Record` has no such key.
 */
export const SUBSCRIBERS_METADATA_KEY: Record<Execution, string> = {
  'main-process': 'zanix:asyncmq-subscribers-in-process',
  'extra-process': 'zanix:asyncmq-subscribers-out-of-process',
}

export const CRONS_METADATA_KEY = 'zanix:asyncmq-cron-jobs'
export const JOBS_METADATA_KEY = 'zanix:asyncmq-jobs'
export const TASKS_METADATA_KEY = 'zanix:asyncmq-tasks'
export const TASKER_URL_METADATA_KEY = 'zanix:asyncmq-tasker-url'

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

export const CACHE_KEYS = {
  job: 'zanix:job',
}
