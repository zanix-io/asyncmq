import { type ConnectorOptions, ZanixAsyncmqConnector } from '@zanix/server'
import { type Channel, type ChannelModel, connect, type ConsumeMessage, type Options } from 'amqp'
import logger from '@zanix/logger'
import { qPath } from './provider/setup.ts'

/**
 * Represents a RabbitMQ connector used by the Zanix integration layer.
 * This class manages the AMQP connection and provides methods for creating
 * lightweight channels with restricted, safe-to-use operations.
 *
 * The connector wraps an underlying AMQP client connection and exposes
 * a simplified API that allows consumers to declare queues, consume messages,
 * acknowledge deliveries, and close channels.
 *
 * @extends ZanixAsyncmqConnector
 */
export class ZanixRabbitMQConnector extends ZanixAsyncmqConnector {
  #uri: string
  #connection!: ChannelModel
  #connected: boolean = false
  private name: string
  constructor(options: ConnectorOptions & { uri: string }) {
    const { uri, ...opts } = options
    super(opts)
    this.#uri = uri
    const targetName = this.constructor.name
    this.name = targetName.startsWith('_Zanix') ? 'asyncmq core' : targetName
  }

  /**
   * Opens a new AMQP channel on the active RabbitMQ connection.
   *
   * Each channel returned by this method is a lightweight virtual channel
   * inside a single TCP connection. Channels should be closed when no longer
   * needed. All functions returned are **bound** to the underlying AMQP
   * channel instance to preserve context.
   *
   * @throws {Error}
   *   If the connector is not connected or the underlying AMQP client fails
   *   to create a channel.
   */
  public async createChannel(): Promise<Channel> {
    await this.isReady
    const channel = await this.#connection.createChannel()

    return channel
  }

  /**
   * Consumes all messages currently present in the specified queue.
   *
   * This method will fetch all messages that exist in the queue at the time
   * of calling. It acknowledges each message after consuming it. Note that
   * messages arriving after this method starts may not be included.
   *
   * @param {string} queue - The name of the queue to consume messages from.
   * @param {Options.AssertQueue & {channel?: Channel}} options - Options to assert the queue (durable, exclusive, etc.).
   * @returns {Promise<ConsumeMessage[]>} A promise that resolves with an array containing
   *   the content of all consumed messages.
   */
  public async consumeAllMessages(
    queue: string,
    options: Options.AssertQueue & {
      isInternal?: boolean
      channel?: Channel
      filter?: (msg: ConsumeMessage) => boolean
    } = {},
  ): Promise<ConsumeMessage[]> {
    await this.isReady
    const { filter = () => true, channel = await this.createChannel(), isInternal, ...opts } =
      options
    const fullQueuePath = isInternal ? qPath(queue) : queue
    const { messageCount } = await channel.assertQueue(fullQueuePath, opts)
    const messages: ConsumeMessage[] = []

    if (messageCount === 0) return messages

    return new Promise((resolve) => {
      let received = 0
      channel.consume(fullQueuePath, (msg) => {
        if (!msg) return
        received++
        if (filter(msg)) {
          messages.push(msg)
          channel.ack(msg)
        }
        if (received === messageCount) {
          if (!options.channel) channel.close().finally(() => resolve(messages))
          else resolve(messages)
        }
      })
    })
  }

  protected async initialize(): Promise<void> {
    this.#connection = await connect(this.#uri)
    this.#connection.on('close', () => {
      this.#connected = false
    })
    logger.success(`RabbitMQ Connected Successfully through '${this.name}' class`)
    this.#connected = true
  }

  protected async close() {
    try {
      // Disconnect from amqp
      logger.info('Closing the RabbitMQ connection...', 'noSave')
      await this.#connection.close()
    } catch (e) {
      if (e?.['message' as never] === 'Connection closing') return
      logger.error(
        `Failed to disconnect RabbitMQ in '${this.name}' class`,
        e,
        'noSave',
      )
    }
  }

  public override isHealthy(): boolean {
    return this.#connected
  }
}
