/**
 *  ______               _
 * |___  /              (_)
 *    / /   __ _  _ __   _ __  __
 *   / /   / _` || '_ \ | |\ \/ /
 * ./ /___| (_| || | | || | >  <
 * \_____/ \__,_||_| |_||_|/_/\_\
 *
 * Zanix AsyncMQ's main entrypoint: the RabbitMQ connector/provider, the Subscriber
 * decorator/base class for queue handlers, and job/cron registration. See `@zanix/asyncmq/worker`
 * for the worker-process bootstrap building blocks, and `@zanix/asyncmq/core` for the
 * side-effect-only connector auto-registration module.
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

// Jobs
export { registerCronJob } from 'modules/jobs/cron.defs.ts'
export { registerJob } from 'modules/jobs/task.defs.ts'

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
export type { CronJobDefinition, CronJobDefinitionBase } from 'typings/crons.ts'
export type { BaseJob, Job, JobDefinition, JobProcess } from 'typings/jobs.ts'
