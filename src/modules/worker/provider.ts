import {
  type HandlerContext,
  type MessageQueue,
  type QueueMessageOptions,
  ZanixWorkerProvider,
} from '@zanix/server'
import type { ZanixCoreAsyncMQProvider } from 'modules/rabbitmq/provider/mod.ts'
import type { FullProcessingQueue } from 'typings/queues.ts'
import type { TaskCallback } from '@zanix/typings'
import type { JobRegistry } from 'typings/jobs.ts'
import type { WorkerManager } from '@zanix/workers'
import { intensiveLocalQueue } from './queues/intensive.ts'
import { moderateLocalQueue } from './queues/moderate.ts'
import { JOBS_METADATA_KEY } from 'utils/constants.ts'
import { softLocalQueue } from './queues/soft.ts'
import { prepareContext } from 'utils/context.ts'
import { processor } from './queues/base.ts'
import logger from '@zanix/logger'
import { join } from '@std/path'

const taskerUrl = join(import.meta.url, '../i-process.ts')

const localQueues: Record<FullProcessingQueue, () => WorkerManager> = {
  'zanix.worker.soft': softLocalQueue,
  'zanix.worker.moderate': moderateLocalQueue,
  'zanix.worker.intensive': intensiveLocalQueue,
}

/**
 * Main provider responsible for executing Jobs and Tasks within Zanix Core.
 *
 * This provider acts as a bridge between:
 * - **Jobs** → durable and distributed processes (AsyncMQ / RabbitMQ)
 * - **Tasks** → local, ephemeral processes executed via Web Workers
 *
 * @class ZanixCoreWorkerProvider
 * @extends ZanixWorkerProvider
 */
export class ZanixCoreWorkerProvider extends ZanixWorkerProvider {
  /**
   * Set of processing queues supported for local task execution.
   * Used to validate and normalize the execution queue.
   *
   * @private
   */
  #queues = new Set<FullProcessingQueue>([
    'zanix.worker.soft',
    'zanix.worker.moderate',
    'zanix.worker.intensive',
  ])

  /**
   * Cache of WorkerManager instances per processing queue.
   * Prevents unnecessary worker re-instantiation.
   *
   * @private
   */
  #localQueues: Record<FullProcessingQueue, WorkerManager | undefined> = {
    'zanix.worker.soft': undefined,
    'zanix.worker.moderate': undefined,
    'zanix.worker.intensive': undefined,
  }

  /**
   * Registry containing all available jobs.
   * Loaded from metadata and cleared after initialization.
   *
   * @private
   */
  #jobs: JobRegistry

  /**
   * Creates a new instance of the worker provider.
   *
   * @param {string} [contextId] - Optional context identifier used for tracing
   *                              and context propagation.
   */
  constructor(contextId?: string) {
    super(contextId)

    this.#jobs = this.registry.get<JobRegistry>(JOBS_METADATA_KEY) || {}
  }

  /**
   * Prepares and normalizes the arguments passed to a job or task.
   *
   * If the job defines an `$args` wrapper, it will be overridden with the
   * provided runtime arguments.
   *
   * @private
   * @param {JobRegistry[keyof JobRegistry]} job - Registered job definition.
   * @param {Message} [args] - Runtime arguments.
   * @returns {Message | null} Final arguments to be used.
   */
  #getJobArgs(job: JobRegistry[keyof JobRegistry], args?: MessageQueue): MessageQueue | null {
    if (job.args && typeof job.args === 'object' && '$args' in job.args) {
      job.args.$args = args || job.args.$args
    } else {
      job.args = args || job.args
    }

    return job.args || null
  }

  /**
   * Executes a **Job** asynchronously using AsyncMQ.
   *
   * Jobs represent:
   * - External or local execution (runs in the main process or in a separate process, depending on the queue configuration)
   * - Durable processes
   * - Distributed execution
   * - Retryable workloads
   *
   * ⚠️ Requires AsyncMQ to be enabled via the `AMQP_URI`
   * environment variable.
   *
   * @param {string} name - Registered job name.
   * @param {Object} [options]
   * @param {string} [options.contextId] - Optional execution context.
   * @param {Message} [options.args] - Payload sent to the job.
   * @param {Omit<QueueMessageOptions, 'contextId' | 'isInternal'>} [options.settings]
   *  - Additional options for publishing the queue message.
   *
   * @returns {Promise<boolean>} Enqueue result or `void` on failure.
   */
  public runJob(
    name: string,
    options: {
      contextId?: string
      args?: MessageQueue
      settings?: Omit<QueueMessageOptions, 'contextId' | 'isInternal'>
    } = {},
  ): Promise<boolean> | boolean {
    const job = this.#jobs[name]

    if (!job) {
      logger.error(`Job not found: '${name}'`, {
        meta: { jobName: name, source: 'zanix', method: 'runJob' },
      })
      return false
    }

    const provider = this.providers.get<ZanixCoreAsyncMQProvider>('asyncmq')

    const { args, contextId, settings } = options

    return provider.enqueue(job.queue, this.#getJobArgs(job, args), {
      isInternal: true,
      contextId: contextId || this.contextId,
      ...job.settings,
      ...settings,
    })
  }

  /**
   * Executes a **Task** locally using Web Workers.
   *
   * Tasks represent:
   * - Local execution (main-process)
   * - Ephemeral lifecycle
   * - Non-persistent workloads
   * - Immediate execution
   *
   * @param {string} name - Registered task/job name.
   * @param {Object} [options]
   * @param {Message} [options.args] - Arguments passed to the task.
   * @param {string} [options.contextId] - Optional execution context.
   * @param {TaskCallback} [options.callback] - Invoked when the task completes.
   * @param {number} [options.timeout=15000] - Maximum execution time in ms.
   *
   * @returns {boolean}
   */
  public runTask(
    name: string,
    options: {
      args?: MessageQueue
      contextId?: string
      callback?: TaskCallback
      timeout?: number
    } = {},
  ): boolean {
    const job = this.#jobs[name]
    const metaError = { jobName: name, source: 'zanix', method: 'runTask' }

    if (!job) {
      logger.error(`Job not found: '${name}'`, { meta: metaError })
      return false
    }

    const { contextId, callback, timeout, args } = options
    const jobArgs = this.#getJobArgs(job, args) as
      | { '$taskId'?: string; '$args'?: MessageQueue }
      | undefined

    if (!jobArgs?.$taskId) {
      logger.error(
        `The job '${name}' does not have a task handler configured`,
        {
          meta: {
            ...metaError,
            suggestion: 'You should provide the `handler` property when calling `registerJob`',
          },
        },
      )
      return false
    }

    const context = prepareContext(this.getContext, contextId) as HandlerContext

    context.payload.body = jobArgs.$args

    const queue = job.queue as FullProcessingQueue

    if (!this.#queues.has(queue)) {
      logger.error(
        `The job '${name}' should not be executed using runTask, as it lacks a defined processingQueue.`,
        {
          meta: {
            ...metaError,
            suggestion:
              'Ensure you provide the `processingQueue` property when calling `registerJob`.',
          },
        },
      )
      return false
    }

    let provider = this.#localQueues[queue]
    if (!provider) {
      provider = localQueues[queue]()
      this.#localQueues[queue] = provider
    }

    provider.task(processor, { metaUrl: taskerUrl, onFinish: callback, timeout })
      .invoke({ taskId: jobArgs.$taskId, context, args: jobArgs.$args || null, queue })

    return true
  }
}
