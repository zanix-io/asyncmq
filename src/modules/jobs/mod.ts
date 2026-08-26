/**
 *  ______               _
 * |___  /              (_)
 *    / /   __ _  _ __   _ __  __
 *   / /   / _` || '_ \ | |\ \/ /
 * ./ /___| (_| || | | || | >  <
 * \_____/ \__,_||_| |_||_|/_/\_\
 *
 * `@zanix/asyncmq/jobs` — job/cron registration only: `registerJob`/`registerCronJob` and the
 * types that describe them. Separate from the bare `.` entry point, which additionally bundles the
 * RabbitMQ connector/providers/subscribers: this subpath's own reachable source imports only
 * `@zanix/server` and `@zanix/validator` — never `amqplib`, nor `@zanix/datamaster`/
 * `@zanix/database` (`mongoose`/`redis`/`@aws-sdk/*`) — so a consumer that only wants to declare
 * jobs (e.g. `@zanix/app`'s manifest-driven job registration) never pays for RabbitMQ or DLQ
 * storage just by importing this. Keeping this subpath's own import graph narrow is what
 * matters: with `nodeModulesDir: "auto"`, Deno materializes the npm packages behind every
 * module a subpath reaches, so a wider import graph here would pull those npm packages down
 * for every consumer regardless of whether they use RabbitMQ or DLQ storage. See
 * `@zanix/asyncmq/dlq` for DLQ reprocessing, which does need `@zanix/database`.
 *
 * @module
 */

export { registerCronJob } from './cron.defs.ts'
export { registerJob } from './task.defs.ts'

export type { BaseJob, Job, JobDefinition, JobProcess } from 'typings/jobs.ts'
export type { CronJobDefinition, CronJobDefinitionBase } from 'typings/crons.ts'
export type { ProcessingQueues } from 'typings/queues.ts'
