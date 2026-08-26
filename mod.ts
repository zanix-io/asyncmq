/**
 *  ______               _
 * |___  /              (_)
 *    / /   __ _  _ __   _ __  __
 *   / /   / _` || '_ \ | |\ \/ /
 * ./ /___| (_| || | | || | >  <
 * \_____/ \__,_||_| |_||_|/_/\_\
 *
 * Zanix AsyncMQ's main entrypoint: the RabbitMQ connector/provider, and the Subscriber
 * decorator/base class for queue handlers. This entry point never re-exports job/cron
 * registration — see `@zanix/asyncmq/jobs` for `registerJob`/`registerCronJob`, a subpath a
 * consumer that only wants to declare jobs can import without pulling in the RabbitMQ connector.
 * See `@zanix/asyncmq/worker` for the worker-process bootstrap building blocks,
 * `@zanix/asyncmq/dlq` for DLQ reprocessing, and `@zanix/asyncmq/core` for the side-effect-only
 * connector auto-registration module.
 *
 * @module
 */

// Connector and providers
export { ZanixRabbitMQConnector } from 'modules/rabbitmq/connector.ts'
export { ZanixCoreAsyncMQProvider } from 'modules/rabbitmq/provider/mod.ts'
export { ZanixCoreWorkerProvider } from 'modules/worker/provider.ts'

// Subscribers
export { ZanixSubscriber } from 'modules/subscribers/base.ts'
export { Subscriber } from 'modules/subscribers/decorators/base.ts'

// Types
export type {
  AssertQueue,
  ErrorInfo,
  Execution,
  IZanixSubscriber,
  MessageInfo,
  QueueConfig,
  QueueOptions,
  SubscriberDecoratorOptions,
} from 'typings/queues.ts'
