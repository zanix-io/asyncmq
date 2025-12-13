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
export type OnMessageInfo = {
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
  context: Record<string, unknown>

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
export type OnErrorInfo = {
  /**
   * Indicates whether the message was requeued after the error.
   */
  requeued: boolean
} & OnMessageInfo

export interface IZanixQueue {
  onmessage: (
    // deno-lint-ignore no-explicit-any
    message: any,
    info: OnMessageInfo,
  ) => void | Promise<void>
  onerror: (
    // deno-lint-ignore no-explicit-any
    message: any,
    error: unknown,
    info: OnErrorInfo,
  ) => void | Promise<void>
}

export type SubscriberMetadata = [string, QueueOptions, new (ctx: HandlerContext) => IZanixQueue]

/** The Queue options */
export type QueueOptions =
  & AssertQueue
  & {
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

export type QueueDecoratorOptions = {
  /** Queue path */
  queue: string
  /** Rto to validate queue event data on message (Body) and request search or params */
  rto?: new (ctx?: unknown) => BaseRTO
  /** Interactor name for injection */
  Interactor?: ZanixInteractorClass
  /** Queue settings */
  settings?: QueueOptions
}
