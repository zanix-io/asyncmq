import type {
  BackoffOptions,
  HandlerContext,
  QueuePriorities,
  ZanixInteractorClass,
} from '@zanix/server'
import type { BaseRTO } from '@zanix/validator'

interface AssertQueue {
  exclusive?: boolean
  durable?: boolean
  autoDelete?: boolean
  arguments?: Record<string, unknown>
  messageTtl?: number
  expires?: number
  maxLength?: number
}

/**
 * Metadata provided when a message is successfully received and processed.
 */
export type MessageInfo = {
  /**
   * Number of delivery attempts for this message.
   */
  attempt: number

  /**
   * Name of the queue from which the message was consumed.
   */
  queue: string

  /**
   * Execution context associated with the message.
   */
  context: HandlerContext

  /**
   * Unique identifier of the message.
   */
  messageId: string

  /**
   * Cron-related information if the message was scheduled.
   */
  cron?: {
    /**
     * Date of the next scheduled execution.
     */
    nextExecution: Date

    /**
     * Name of the cron job.
     */
    name: string

    /**
     * Cron expression used for scheduling.
     */
    expression: string
  }

  /**
   * Indicates whether the message was requeued from a dead-letter queue.
   */
  requeuedFromDeadLetter?: boolean
}

/**
 * Metadata provided when an error occurs while processing a message.
 */
export type ErrorInfo = {
  /**
   * Indicates whether the message was requeued after the error.
   */
  requeued: boolean
} & MessageInfo

export interface IZanixSubscriber {
  onmessage: (
    // deno-lint-ignore no-explicit-any
    message: any,
    info: MessageInfo,
  ) => void | Promise<void>
  onerror: (
    // deno-lint-ignore no-explicit-any
    message: any,
    error: unknown,
    info: ErrorInfo,
  ) => void | Promise<void>
}

export type SubscriberMetadata = [
  string,
  QueueOptions,
  new (ctx: HandlerContext) => IZanixSubscriber,
]

/** The Queue options */
export type QueueOptions =
  & AssertQueue
  & {
    /**
     * The number of messages to prefetch per channel.
     * This setting controls how many messages AMQP will deliver to the consumer
     * before the consumer acknowledges any of them, ensuring that no more than the
     * specified number of messages are being processed concurrently.
     *
     * Defaults to `1`.
     */
    channelPrefetch?: number
    /**
     * The number of consumer channels to create for this queue.
     *
     * Each channel corresponds to a separate consumer, allowing parallel processing
     * and isolation between messages. More channels increase concurrency but also
     * consume more resources.
     *
     * @default 1
     */
    consumerChannels?: number
    /**
     * Defines the priority level assigned to messages published to this queue.
     *
     * This is an optional semantic priority used by the application or framework
     * to map human-readable priority levels (low, medium, high) to the numeric
     * AMQP priority system. The actual numeric priority mapping depends on the
     * implementation.
     */
    maxPriority?: QueuePriorities
    /**
     * Indicates whether this queue should be included in the global exchange.
     *
     * When set to `true`, the queue will be automatically bound to the global
     * topic exchange, allowing it to receive messages published using
     * `sendMessage()`.
     */
    includeInGlobalExchange?: boolean
    /**
     * Retry configuration for message handling, with support for a custom
     * backoff strategy.
     */
    retryConfig?: {
      /**
       * Maximum number of retries allowed before moving the message to
       *   a dead-letter queue or marking it as permanently failed.
       */
      maxRetries?: number
      /**
       * A custom function that determines the retry delay (in milliseconds)
       *   based on the current retry attempt.
       *
       *   The optional `options` argument may include as default:
       *   - `exponentialTimeout` — Base timeout in milliseconds (default: `15000`)
       *   - `exponentialBackoffCoefficient` — Coefficient for backoff growth (default: `2`)
       */
      backoffStrategy?: false | ((attempt: number, options?: BackoffOptions) => number)
    }
  }

/**
 * Determines a the job is executed.
 *
 * - 'main-process': Runs in the main application process (default).
 * - 'extra-process': Reserved for external worker processes, such as AMQP-based workers,
 *   typically used for distributed or asynchronous job execution.
 */
export type Execution = 'main-process' | 'extra-process'

/**
 * Defines the configuration for a job queue.
 *
 * Can be either:
 * 1. A simple string representing the queue path or identifier in the broker.
 * 2. An object with advanced options:
 *    - `execution` (optional): Determines whether the job runs in main-process or in extra-process.
 *      Defaults to `'main-process'` if not specified.
 *    - `settings`: Additional queue settings.
 *    - `topic`: Queue path or identifier in the broker.
 */
export type QueueConfig =
  | string
  | {
    /**
     * Determines if the job queue runs in the main process or in an external worker process. Defaults to 'main-process'.
     *
     * ⚠️ Note: If you are using the "extra-process," make sure to run it by importing @zanix/asyncmq/worker.
     */
    execution?: Execution
    /** Queue settings such as concurrency, retry policies, etc. */
    settings?: QueueOptions
    /** Queue path or identifier in the broker. */
    topic: string
  }

export type SubscriberDecoratorOptions = {
  /** Rto to validate queue event data on message (Body) and request search or params */
  rto?: new (ctx?: unknown) => BaseRTO
  /** Interactor name for injection */
  Interactor?: ZanixInteractorClass
  /** Queue options */
  queue: QueueConfig
}

/**
 * Defines the processing intensity classification for worker queues.
 *
 * This type is used to route jobs to workers based on the expected
 * computational load or resource usage.
 *
 * - `soft`      : Light jobs that are fast, non-blocking, and consume minimal CPU/memory.
 * - `moderate`  : Medium jobs with mixed I/O and CPU usage, suitable for standard workers.
 * - `intensive` : Heavy jobs that are CPU-bound or long-running, may require dedicated workers.
 */
export type ProcessingQueues = 'soft' | 'moderate' | 'intensive'

export type FullProcessingQueue = `zanix.worker.${ProcessingQueues}`
