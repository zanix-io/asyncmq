import { type ConnectorOptions, ZanixAsyncmqConnector } from '@zanix/server'
import {
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
  connect,
  type ConsumeMessage,
  type Options,
} from 'amqp'
import logger from '@zanix/logger'
import { qPath } from './provider/setup.ts'

/** Reconnection policy of {@link ZanixRabbitMQConnector} after an unexpected connection loss. */
export type ReconnectOptions = {
  /** Reconnect with backoff (`true`, default). `false` fails fast: `onExhausted` runs on the first loss. */
  enabled?: boolean
  /** Failed attempts tolerated before giving up and calling `onExhausted`. Defaults to `10`. */
  maxAttempts?: number
  /** Delay before the first attempt, doubled on each failure (with jitter). Defaults to `1000`. */
  initialDelayMs?: number
  /** Upper bound of the doubling delay. Defaults to `30000`. */
  maxDelayMs?: number
  /**
   * Called once when the connection is lost and will not be restored (reconnection disabled or
   * attempts exhausted). Defaults to logging the failure and `Deno.exit(1)`, so the orchestrator
   * restarts the service instead of leaving a process that looks alive but consumes nothing.
   */
  onExhausted?: (error?: unknown) => void
}

const defaultOnExhausted = (error?: unknown) => {
  logger.error(
    'RabbitMQ connection lost and not recovered. Exiting so the process is restarted.',
    error,
    'noSave',
  )
  Deno.exit(1)
}

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
  /** Set by `close()`: an intentional shutdown must never trigger a reconnect. */
  #closing = false
  #reconnecting = false
  /** Whether the *current* connection has already emitted `close`. */
  #connectionDead = false
  #reconnect: Required<ReconnectOptions>
  #reconnectHooks: Array<() => unknown> = []
  /** Pending while the connection is being re-established; `createChannel` waits on it. */
  #ready: Promise<void> = Promise.resolve()
  #releaseReady?: () => void
  /** Display name used in connection/disconnection log messages. */
  private name: string
  /** Creates the connector from the AMQP URI and any base `ZanixAsyncmqConnector` options. */
  constructor(options: ConnectorOptions & { uri: string; reconnect?: ReconnectOptions }) {
    const { uri, reconnect, ...opts } = options
    super(opts)
    this.#uri = uri
    this.#reconnect = {
      enabled: reconnect?.enabled ?? true,
      maxAttempts: reconnect?.maxAttempts ?? 10,
      initialDelayMs: reconnect?.initialDelayMs ?? 1000,
      maxDelayMs: reconnect?.maxDelayMs ?? 30000,
      onExhausted: reconnect?.onExhausted ?? defaultOnExhausted,
    }
    // `coreDisplayName` (`ZanixConnector`, `@zanix/server`) strips the internal `_Zanix`-prefixed
    // synthetic subclass name a core connector is auto-registered under, falling back to
    // 'asyncmq core' — a no-op for any ordinary, consumer-authored subclass.
    this.name = this.coreDisplayName('asyncmq core')
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
    await this.#ready
    const channel = await this.#connection.createChannel()

    return channel
  }

  /**
   * Opens a confirm channel: publishes on it can be acknowledged (or rejected) by the broker.
   *
   * @throws {Error} If the connector is not connected or the AMQP client fails to create it.
   */
  public async createConfirmChannel(): Promise<ConfirmChannel> {
    await this.isReady
    await this.#ready
    return await this.#connection.createConfirmChannel()
  }

  /** Resolves once the connection is usable; waits through a reconnection in progress. */
  public async waitForConnection(): Promise<void> {
    await this.isReady
    await this.#ready
  }

  /**
   * Registers a callback run after every successful reconnection, once the new connection is up
   * (channels, consumers and other per-connection state must be re-created there). If it throws,
   * the new connection is discarded and the attempt counts as failed.
   */
  public onReconnect(callback: () => unknown): void {
    this.#reconnectHooks.push(callback)
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
    await this.waitForConnection()
    const {
      filter = () => true,
      channel = await this.createChannel(),
      isInternal,
      ...opts
    } = options
    const fullQueuePath = isInternal ? qPath(queue) : queue
    const { messageCount } = await channel.assertQueue(fullQueuePath, opts)
    const messages: ConsumeMessage[] = []

    if (messageCount === 0) {
      if (!options.channel) await channel.close()
      return messages
    }

    return new Promise((resolve, reject) => {
      let received = 0
      let done = false
      // A connection drop mid-way would otherwise leave this promise pending forever.
      channel.once('error', reject)
      channel.once('close', () => {
        if (!done) reject(new Error('Channel closed before consuming all messages'))
      })
      channel.consume(fullQueuePath, (msg: ConsumeMessage | null) => {
        if (!msg) return
        received++
        if (filter(msg)) {
          messages.push(msg)
          channel.ack(msg)
        }
        if (received === messageCount) {
          done = true
          if (!options.channel) {
            channel.close().finally(() => resolve(messages))
          } else resolve(messages)
        }
      })
    })
  }

  /** Opens the AMQP connection. Overridable seam so tests can inject a fake connection. */
  protected openConnection(): Promise<ChannelModel> {
    return connect(this.#uri)
  }

  /** Opens the underlying AMQP connection and tracks its `close`/`error` events. */
  protected async initialize(): Promise<void> {
    this.#closing = false
    this.#attach(await this.openConnection())
    logger.success(
      `RabbitMQ Connected Successfully through '${this.name}' class`,
    )
    this.#connected = true
  }

  #attach(connection: ChannelModel) {
    this.#connection = connection
    this.#connectionDead = false
    // amqplib emits `error` (then `close`) on a broker-initiated shutdown; without a listener the
    // event would be thrown as an uncaught exception.
    connection.on('error', (e: unknown) => {
      logger.warn(`RabbitMQ connection error in '${this.name}' class`, { cause: e })
    })
    connection.on('close', (e?: unknown) => {
      if (connection !== this.#connection) return
      this.#connectionDead = true
      this.#connected = false
      if (this.#closing || this.#reconnecting) return
      logger.warn(`RabbitMQ connection lost in '${this.name}' class`, { cause: e })
      this.#onConnectionLost(e)
    })
  }

  #onConnectionLost(error?: unknown) {
    const { enabled, onExhausted } = this.#reconnect
    if (!enabled) return onExhausted(error)

    this.#reconnecting = true
    this.#arm()
    this.#reconnectLoop(error).then((recovered) => {
      this.#reconnecting = false
      if (recovered) return
      // Waiters stay pending: the process is about to exit (or the caller owns the failure).
      this.#reconnect.onExhausted(error)
    })
  }

  /** Makes `#ready` pending (no-op if it already is). */
  #arm() {
    if (this.#releaseReady) return
    this.#ready = new Promise<void>((resolve) => this.#releaseReady = resolve)
  }

  #release() {
    const release = this.#releaseReady
    this.#releaseReady = undefined
    release?.()
  }

  /** One reconnection attempt after a backoff delay; recurses on failure up to `maxAttempts`. */
  async #reconnectLoop(lastError?: unknown, attempt = 1): Promise<boolean> {
    const { maxAttempts, initialDelayMs, maxDelayMs } = this.#reconnect
    if (attempt > maxAttempts) {
      logger.error(
        `RabbitMQ reconnection gave up after ${maxAttempts} attempts in '${this.name}' class`,
        lastError,
        'noSave',
      )
      return false
    }

    const backoff = Math.min(maxDelayMs, initialDelayMs * 2 ** (attempt - 1))
    await new Promise((r) => setTimeout(r, backoff * (0.5 + Math.random() / 2)))
    if (this.#closing) {
      this.#release()
      return true
    }
    logger.info(
      `Reconnecting RabbitMQ in '${this.name}' class (attempt ${attempt}/${maxAttempts})...`,
      'noSave',
    )
    let connection: ChannelModel | undefined
    try {
      connection = await this.openConnection()
      this.#attach(connection)
      // Released *before* the hooks: they create channels through this connector, which waits
      // on `#ready`. The first hook is invoked synchronously, ahead of any other waiter.
      this.#release()
      // Hooks are sequential on purpose: later ones may depend on earlier ones.
      // deno-lint-ignore no-await-in-loop
      for (const hook of this.#reconnectHooks) await hook()
      // The new connection may have dropped while the hooks were running.
      if (this.#connectionDead) throw new Error('Connection dropped during recovery')
      this.#connected = true
      logger.success(`RabbitMQ reconnected successfully through '${this.name}' class`)
      return true
    } catch (e) {
      this.#arm()
      logger.warn(`RabbitMQ reconnection attempt ${attempt} failed in '${this.name}' class`, {
        cause: e,
      })
      await connection?.close().catch(() => {})
      return await this.#reconnectLoop(e, attempt + 1)
    }
  }

  /** Closes the underlying AMQP connection, ignoring an already-closing connection. */
  protected async close() {
    this.#closing = true
    this.#connected = false
    try {
      // Disconnect from amqp
      logger.info('Closing the RabbitMQ connection...', 'noSave')
      await this.#connection?.close()
    } catch (e) {
      if (e?.['message' as never] === 'Connection closing') return
      logger.error(
        `Failed to disconnect RabbitMQ in '${this.name}' class`,
        e,
        'noSave',
      )
    }
  }

  /** Whether the underlying AMQP connection is currently open. */
  public override isHealthy(): boolean {
    return this.#connected
  }
}
