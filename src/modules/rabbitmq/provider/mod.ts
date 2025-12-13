import type { SubscriberMetadata } from 'typings/queues.ts'
import type { ZanixRabbitMQConnector } from '../connector.ts'
import type { CronRegistry } from 'typings/crons.ts'
import type { Channel } from 'amqp'

import { type QueueMessageOptions, type ScheduleOptions, ZanixAsyncMQProvider } from '@zanix/server'
import {
  CRONS_METADATA_KEY,
  GLOBAL_EXCHANGE,
  MESSAGE_HEADERS,
  QUEUES_METADATA_KEY,
  SCHEDULER_EXCHANGE,
} from 'utils/constants.ts'
import {
  cronqPath,
  deadletterOpts,
  dlqPath,
  qPath,
  schedulerOpts,
  schqPath,
  setup,
} from './setup.ts'
import { decode, encode, prepareOptions } from './messages.ts'
import { ApplicationError } from '@zanix/errors'
import { generateUUID } from '@zanix/helpers'
import { nextCronDate } from 'utils/cron.ts'

/**
 * ZanixAsyncMQProvider is a provider class responsible for managing
 * asynchronous message queues using RabbitMQ (or other async MQ connectors).
 *
 * This class handles:
 *  - Initialization and configuration of the async MQ connector.
 *  - Opening and managing channels.
 *  - Registering subscriber queues and bindings.
 *  - Processing messages with retry and backoff strategies.
 *  - Sending messages to specific queues or to global exchanges via topics.
 *
 * It extends {@link ZanixAsyncMQProvider}, inheriting base provider functionality
 * and integrating it with an asynchronous messaging system.
 *
 * @extends ZanixAsyncMQProvider
 */
export class ZanixCoreAsyncMQProvider extends ZanixAsyncMQProvider {
  #connector: ZanixRabbitMQConnector
  #isConfigured: Promise<boolean>
  #channel!: Channel
  #secret: string

  constructor(contextId?: string) {
    super(contextId)
    this.#secret = Deno.env.get('DATA_AMQP_SECRET') || 'zanix_default_secret'
    this.#connector = this.use<ZanixRabbitMQConnector>(false)
    this.#isConfigured = new Promise((resolve) =>
      queueMicrotask(() =>
        this.#setup().then(() => {
          resolve(true)
        })
      )
    )
    queueMicrotask(() => this.#executeCrons())
  }

  /**
   * Initializes the messaging environment by configuring the RabbitMQ connector,
   * opening a channel, and registering all queue definitions discovered in the
   * subscriber registry.
   *
   * This method:
   *  1. Waits for the configured `asyncmq` connector to become ready.
   *  2. Opens a new AMQP channel for this worker/service.
   *  3. Retrieves all subscriber metadata associated with `QUEUES_DATA_KEY`.
   *  4. Prepares queues, bindings, and consumption logic (if applicable).
   *
   * It is invoked internally as part of the connector initialization workflow.
   * This method must complete before message publishing or consuming can occur.
   */
  async #setup() {
    this.#channel = await this.#connector.createChannel()

    const queues = this.registry.get<SubscriberMetadata[]>(QUEUES_METADATA_KEY)

    await setup({
      connector: this.#connector,
      cache: this.cache,
      kvLocal: this.kvLocal,
      channel: this.#channel,
      tmpChannel: await this.#connector.createChannel(),
      secret: this.#secret,
      queues,
    })

    this.registry.delete(QUEUES_METADATA_KEY)

    return true
  }

  /**
   * Execute crons
   */
  async #executeCrons() {
    const crons = this.registry.get<CronRegistry[]>(CRONS_METADATA_KEY)
    if (crons) {
      await this.#isConfigured
      const cronExecutionPromises = crons.map(async ([cron, options]) => {
        const { queue, args, settings, schedule, isActive } = options
        const fullQueuePath = qPath(queue)
        const cronQueue = cronqPath(fullQueuePath)
        const schedulerQueue = schqPath(cronQueue)
        // consume messages to re write it
        await this.#connector.consumeAllMessages(schedulerQueue, {
          ...schedulerOpts,
          deadLetterRoutingKey: fullQueuePath,
        })
        if (!isActive) return
        await this.schedule(cronQueue, args || `cron message by "${cron}"`, {
          contextId: generateUUID(),
          ...settings,
          date: nextCronDate(schedule),
          messageId: cron,
          headers: { [MESSAGE_HEADERS.cronIdentifier]: cron },
        })
      })
      await Promise.all(cronExecutionPromises)

      this.registry.delete(CRONS_METADATA_KEY)
    }
  }

  /**
   * Sends a message directly to a specific queue.
   *
   * The message can be a string or an object. Objects are automatically
   * encoded before sending. The method ensures the connector is configured,
   * resolves the full queue path, encodes the message, and publishes it to
   * the queue using `sendToQueue`.
   *
   * @param {string} queue - The name of the target queue (logical name before path resolution).
   * @param {string | Record<string, unknown>} message - The message payload to send.
   *   Objects will be encoded via the internal encoding mechanism.
   * @param {MessageOptions} [options] - Optional AMQP publish options (e.g., persistent, priority).
   * @returns {Promise<boolean>} A promise that resolves to the result of `sendToQueue`.
   */
  public async enqueue(
    queue: string,
    message: string | Record<string, unknown>,
    { isInternal, ...options }: QueueMessageOptions,
  ): Promise<boolean> {
    await this.#isConfigured
    const opts = await prepareOptions(options, this.#secret, this.getContext)
    const queuePath = isInternal ? qPath(queue) : queue
    const secureMessage = await encode(message, this.#secret)
    return this.#channel.sendToQueue(queuePath, secureMessage, opts)
  }

  /**
   * Sends a message to the global exchange using a topic-based routing key.
   *
   * This method is used when publishing messages intended for multiple consumers
   * via a topic exchange. The message is encoded automatically, and then published
   * using `publish` with the provided topic routing key.
   *
   * @param {string} topic - The routing key used by the global exchange.
   *   This determines how queues bound to the exchange will receive the message.
   * @param {string | Record<string, unknown>} message - The message payload.
   *   Objects are encoded before publishing.
   * @param {MessageOptions} [options] - Optional AMQP publish options.
   * @returns {Promise<boolean>} A promise that resolves to the result of `publish`.
   */
  public override async sendMessage(
    topic: string,
    message: string | Record<string, unknown>,
    { isInternal, ...options }: QueueMessageOptions,
  ): Promise<boolean> {
    await this.#isConfigured
    const opts = await prepareOptions(options, this.#secret, this.getContext)
    // const topicRoute = isInternal? project+'*'+topic: topic
    if (topic[0] === '*') topic = '__all__' + topic.slice(1)
    else if (isInternal) topic = qPath(topic)

    const secureMessage = await encode(message, this.#secret)
    return this.#channel.publish(GLOBAL_EXCHANGE, topic, secureMessage, opts)
  }

  /**
   * Requeues all messages found in the Dead Letter Queue (DLQ) associated
   * with the specified queue.
   *
   * This method:
   *  1. Waits for the instance to be fully configured.
   *  2. Retrieves all messages present in the DLQ.
   *  3. Sends each message back to the original queue.
   *  4. Returns the decoded messages.
   *
   * @param {string} queue - The name of the queue whose Dead Letter Queue will be processed.
   * @returns {Promise<any[]>} A promise that resolves to an array of decoded messages.
   */
  // deno-lint-ignore no-explicit-any
  public override async requeueDeadLetters(queue: string): Promise<any[]> {
    await this.#isConfigured
    const queuePath = qPath(queue)
    const messages = await this.#connector.consumeAllMessages(
      dlqPath(queuePath),
      deadletterOpts,
    )

    return Promise.all(messages.map((message) => {
      message.properties.headers = {
        ...message.properties.headers,
        [MESSAGE_HEADERS.rqFromDL]: true,
      }
      this.#channel.sendToQueue(queuePath, message.content, message.properties)
      return decode(message.content, this.#secret)
    }))
  }

  /**
   * Schedules a message to be published to a queue at a future time.
   *
   * The message can be scheduled either by specifying an absolute date or a delay
   * (in milliseconds). When `isInternal` is set, the queue name is resolved through
   * the internal queue path mechanism.
   *
   * @async
   * @param {string} queue - The name of the queue where the message will be published.
   * @param {string | Record<string, unknown>} message - The message payload to send.
   *   It will be securely encoded before publication.
   * @param {Omit<QueueMessageOptions, 'expiration'> & Object} options - Configuration options
   *   for scheduling and message publishing.
   * @param {Date} [options.date] - The absolute date at which the message should be delivered.
   *   If provided, it overrides `delay`.
   * @param {number} [options.delay=0] - Delay in milliseconds before the message is delivered.
   *   Used when `date` is not provided.
   *
   * @returns {Promise<boolean>} Resolves to `true` if the message was successfully scheduled.
   */
  public override async schedule(
    queue: string,
    message: string | Record<string, unknown>,
    { isInternal, date, delay = 0, ...options }:
      & Omit<QueueMessageOptions, 'expiration'>
      & ScheduleOptions,
  ): Promise<boolean> {
    await this.#isConfigured
    const opts = await prepareOptions(options, this.#secret, this.getContext)
    const queuePath = isInternal ? qPath(queue) : queue
    const secureMessage = await encode(message, this.#secret)
    if (date) opts.expiration = delay + date.getTime() - Date.now()
    else if (delay) opts.expiration = delay

    if (typeof opts.expiration === 'number' && opts.expiration <= 0) {
      throw new ApplicationError(
        'Queue expiration schedule is invalid: the resulting time must be in the future.',
        {
          meta: {
            source: 'zanix',
            action: 'queue schedule',
            date,
            delay,
            expiration: opts.expiration,
          },
        },
      )
    }

    return this.#channel.publish(SCHEDULER_EXCHANGE, schqPath(queuePath), secureMessage, opts)
  }
}
