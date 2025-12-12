import type { SubscriberMetadata } from 'typings/queues.ts'
import type { ZanixRabbitMQConnector } from './connector.ts'
import type { Channel, Options } from 'amqp'

import { getStoragedQueueOptions, processorHandler, storageQueueOptions } from 'utils/queues.ts'
import { decode, encode, prepareOptions } from 'utils/messages.ts'
import { type QueueMessageOptions, ZanixAsyncMQProvider } from '@zanix/server'
import { readConfig } from '@zanix/helpers'
import {
  DEADLETTER_EXCHANGE,
  GLOBAL_EXCHANGE,
  QUEUE_PRIORITY,
  QUEUES_METADATA_KEY,
} from 'utils/constants.ts'

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
  public connector: ZanixRabbitMQConnector
  #isConfigured: Promise<boolean>
  #channel!: Channel
  #project: string
  #secret: string

  constructor(contextId?: string) {
    super(contextId)
    this.#project = readConfig().name || ''
    this.#secret = Deno.env.get('DATA_AMQP_SECRET') || 'zanix_default_secret'
    this.connector = this.connectors.get<ZanixRabbitMQConnector>('asyncmq')
    this.#isConfigured = this.#setup()
  }

  #deadletterOpts = {
    messageTtl: 30 * 24 * 60 * 60 * 1000, // expire in 30 days
    durable: true,
  }
  #dlq = (queue: string) => `${queue}.dlq`
  #queuePath = (queue: string) => `${this.#project}.${queue}`

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
    this.#channel = await this.connector.createChannel()

    const queues = this.registry.get<SubscriberMetadata[]>(QUEUES_METADATA_KEY)

    if (!queues) {
      this.kvLocal.delete(QUEUES_METADATA_KEY)
      return false
    }

    const storagedQueues = await getStoragedQueueOptions<Record<string, string>>(
      this.cache,
      this.kvLocal,
    )
    const queueOptions: typeof storagedQueues = {}

    // Create global exchanges
    await this.#channel.assertExchange(GLOBAL_EXCHANGE, 'topic', { durable: true })
    await this.#channel.assertExchange(DEADLETTER_EXCHANGE, 'direct', { durable: true })

    const queuesPaths: string[] = []

    // Prepare Queues
    for await (const [queue, options, Queue] of queues) {
      queuesPaths.push(queue)
      const { includeInGlobalExchange, retryConfig, maxPriority, ...baseOpts } = options
      const opts: Options.AssertQueue = baseOpts
      const fullQueuePath = this.#queuePath(queue)

      // Defaults
      opts.durable = opts.durable ?? true
      opts.deadLetterExchange = DEADLETTER_EXCHANGE
      opts.deadLetterRoutingKey = fullQueuePath

      // Priority
      if (maxPriority) opts.maxPriority = QUEUE_PRIORITY[maxPriority]

      const storagedOptions = storagedQueues[queue]
      const currentOpts = JSON.stringify(opts)
      queueOptions[queue] = currentOpts

      // Re create queue if has changed, or assert it
      if (storagedOptions && storagedOptions !== currentOpts) {
        const oldOptions = JSON.parse(storagedOptions)
        const messages = await this.connector.consumeAllMessages(
          this.#channel,
          fullQueuePath,
          oldOptions,
        )

        await this.#channel.deleteQueue(fullQueuePath, oldOptions)
        await this.#channel.assertQueue(fullQueuePath, opts)
        for (const message of messages) {
          this.#channel.sendToQueue(fullQueuePath, message.content, message.properties)
        }
      } else {
        await this.#channel.assertQueue(fullQueuePath, opts)
      }

      if (includeInGlobalExchange) {
        await this.#channel.bindQueue(fullQueuePath, GLOBAL_EXCHANGE, queue)
      } else {
        await this.#channel.unbindQueue(fullQueuePath, GLOBAL_EXCHANGE, queue)
      }

      // Bind deadletter
      const dlq = this.#dlq(fullQueuePath)
      await this.#channel.assertQueue(dlq, this.#deadletterOpts)
      await this.#channel.bindQueue(dlq, DEADLETTER_EXCHANGE, fullQueuePath)

      // Prepare processor
      await this.#channel.consume(
        fullQueuePath,
        processorHandler(Queue, this.#channel, {
          queue: fullQueuePath,
          secret: this.#secret,
          retries: retryConfig,
        }),
      )
    }

    // Delete orphans
    const queuesToDelete = Object.entries(storagedQueues).filter((key) =>
      !queuesPaths.includes(key[0])
    )
    for await (const [queue, options] of queuesToDelete) {
      const fullQueuePath = this.#queuePath(queue)
      await this.#channel.deleteQueue(fullQueuePath, JSON.parse(options))
      await this.#channel.deleteQueue(this.#dlq(fullQueuePath), JSON.parse(options))
    }

    await storageQueueOptions(queueOptions, this.cache, this.kvLocal)

    this.registry.delete(QUEUES_METADATA_KEY)

    return true
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
    { isInternal, ...options }: QueueMessageOptions & { isInternal?: boolean },
  ): Promise<boolean> {
    await this.#isConfigured
    const opts = await prepareOptions(options, this.#secret, this.getContext)
    const queuePath = isInternal ? this.#queuePath(queue) : queue
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
    options: QueueMessageOptions,
  ): Promise<boolean> {
    await this.#isConfigured
    const opts = await prepareOptions(options, this.#secret, this.getContext)
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
    const queuePath = this.#queuePath(queue)
    const messages = await this.connector.consumeAllMessages(
      this.#channel,
      this.#dlq(queuePath),
      this.#deadletterOpts,
    )

    return Promise.all(messages.map((message) => {
      this.#channel.sendToQueue(queuePath, message.content, message.properties)
      return decode(message.content, this.#secret)
    }))
  }
}
