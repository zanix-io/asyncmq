import type {
  HandlerContext,
  MessageQueue,
  QueueMessageOptions,
  ZanixConnectorsGetter,
  ZanixInteractorsGetter,
  ZanixProvidersGetter,
} from '@zanix/server'
import type { ProcessingQueues } from './queues.ts'

/**
 * Represents a job execution function.
 *
 * A job receives a context as its first argument,
 * followed by a variable list of arguments defined by the job itself.
 *
 * Jobs may be synchronous or asynchronous.
 *
 * @template A
 * Tuple representing the arguments accepted by the job.
 *
 * @template TResult
 * The result returned by the job execution.
 *
 * @example
 * ```ts
 * const sendEmail: Job<[string, string], void> = async (
 *   { providers },
 *   to,
 *   body,
 * ) => {
 *   await providers.email.send({ to, body })
 * }
 * ```
 */
export type Job<A extends MessageQueue = MessageQueue, TResult = unknown> = (
  this: {
    providers: ZanixProvidersGetter
    interactors: ZanixInteractorsGetter
    connectors: ZanixConnectorsGetter
    context: HandlerContext & { queue?: string }
  },
  args: A,
) => Promise<TResult> | TResult

/**
 * Internal representation of a registered job.
 *
 * Stored as a tuple where:
 * - index 0 is the job name
 * - index 1 is the job definition without the name
 *
 * This structure enables efficient lookup and prevents
 * duplication of the job identifier.
 */
export type JobRegistry = Record<string, Omit<BaseJob, 'name'> & { queue: string }>

/**
 * Describes how a process is published and executed within the system.
 *
 * This strict separation allows TypeScript to discriminate between
 * process declaration strategies and prevents invalid configurations at compile time.
 *
 * @example
 * // Explicit Async Message Queue
 * const cronJob: JobProcess = {
 *   customQueue: 'cron.daily',
 * }
 *
 * @example
 * // Job using managed Async Message Queue based on processing intensity
 * const emailJob: JobProcess = {
 *   processingQueue: 'soft',
 *   handler: sendEmailJob,
 * }
 */
export type JobProcess<A extends MessageQueue = MessageQueue, T = unknown> =
  | {
    /**
     * Explicit Async Message Queue (`customQueue`):
     *
     * Name of the Async Message Queue where the process will be published.
     *
     * - The process is published directly to a **named Async Message Queue** defined in some Subscriber.
     * - Intended for system-level workflows (e.g., jobs, orchestration, legacy consumers).
     * - Queue selection and execution semantics are fully controlled by the user.
     */
    customQueue: string
    processingQueue?: never
    handler?: never
  }
  | {
    /**
     * Processing Queue (`processingQueue`)
     *
     * Abstraction for asynchronous job execution with configurable
     * routing, priority, and concurrency.
     *
     * Processing intensity classification controls execution strategy
     * (`soft`, `moderate`, `intensive`).
     *
     * - Jobs are routed automatically based on processing intensity.
     * - The `handler` defines the asynchronous job logic.
     * - Supports retries and replay depending on the execution backend.
     *
     * ### Execution backends
     *
     * `processingQueue` supports multiple execution backends:
     *
     * - **ASYNCMQ**: jobs are executed in a dedicated external process.
     * - **Local Web Worker queues**: jobs are executed locally using Web Workers.
     *
     * ⚠️ When using ASYNCMQ (`worker.runJob` or `cronJobs`), a secondary process must be running.
     * Start it by importing `@zanix/asyncmq/worker`.
     */
    processingQueue: ProcessingQueues
    /** Logic executed by the job or task. */
    handler: Job<A, T>
    customQueue?: never
  }

export type BaseJob<A extends MessageQueue = MessageQueue> = {
  /**
   * Unique identifier for the job.
   *
   * This name is used for registration, routing,
   * and execution lookup.
   */
  name: string
  /** Arguments to pass to the cron job. It can be a string or an object with unknown keys and values. */
  args?: A
  /**
   * Additional options for the queue message.
   *
   * ⚠️ Note: These options are only taken into account for jobs executed with `worker.runJob` when using AsyncMQ.
   */
  settings?: Omit<QueueMessageOptions, 'contextId' | 'isInternal'>
}

/**
 * Defines the structure of a job configuration.
 *
 * This is used to register and route jobs
 * within the system based on their name and execution weight.
 */
export type JobDefinition<A extends MessageQueue, T> = BaseJob<A> & JobProcess<A, T>
