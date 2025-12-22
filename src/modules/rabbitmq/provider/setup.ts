import type { ZanixCacheProvider, ZanixKVConnector } from '@zanix/server'
import type { ZanixRabbitMQConnector } from '../connector.ts'
import type { Execution, SubscriberMetadata } from 'typings/queues.ts'
import type { Options } from 'amqp'

import { getStoragedQueueOptions, storageQueueOptions } from 'utils/queues.ts'
import { processorHandler } from 'modules/subscribers/handler.ts'
import type { CronRegistry } from 'typings/crons.ts'
import {
  DEADLETTER_EXCHANGE,
  GLOBAL_EXCHANGE,
  QUEUE_PRIORITY,
  SCHEDULER_EXCHANGE,
  SUBSCRIBERS_METADATA_KEY,
} from 'utils/constants.ts'
import { readConfig } from '@zanix/helpers'
import logger from '@zanix/logger'

export const project = readConfig().name || ''

export const deadletterOpts = {
  messageTtl: 30 * 24 * 60 * 60 * 1000, // expire in 30 days
  durable: true,
}
export const schedulerOpts = { durable: true, deadLetterExchange: SCHEDULER_EXCHANGE }
export const dlqPath = (queue: string) => `${queue}.dlq` // deadletter queue
export const schqPath = (queue: string) => `${queue}.schq` // scheduled queue
export const cronqPath = (queue: string) => `${queue}.cron` // cron queue
export const qPath = (queue: string) => queue ? `${project}.${queue}` : project

const checkQueue = async (
  connector: ZanixRabbitMQConnector,
  queueName: string,
) => {
  const channel = await connector.createChannel()
  channel.on('error', () => {})
  channel.on('close', () => {})
  const q = await channel.checkQueue(queueName).catch((e) => {
    if (e.code === 404) {
      return { consumerCount: 0, messageCount: 0 }
    }
    throw e
  })
  await channel.close().catch(() => {})
  return { isUnused: q.consumerCount === 0, isEmpty: q.messageCount === 0, queueName }
}

/**
 * Initializes the messaging environment by configuring the RabbitMQ connector,
 * opening a channel, and registering all queue definitions discovered in the
 * subscriber registry.
 *
 * This method:
 *  1. Waits for the configured `asyncmq` connector to become ready.
 *  3. Retrieves all subscriber metadata associated with `QUEUES_DATA_KEY`.
 *  4. Prepares queues, bindings, and consumption logic (if applicable).
 *
 * It is invoked internally as part of the connector initialization workflow.
 * This method must complete before message publishing or consuming can occur.
 */
export async function setup(
  options: {
    execution: Execution
    connector: ZanixRabbitMQConnector
    subscribers?: SubscriberMetadata[]
    crons?: CronRegistry[]
    kvLocal: ZanixKVConnector
    cache: ZanixCacheProvider
    secret: string
  },
) {
  const { subscribers, crons, execution, kvLocal, cache, connector, secret } = options

  const subscriberKey = SUBSCRIBERS_METADATA_KEY[execution]

  if (!subscribers) {
    if (subscriberKey) kvLocal.delete(subscriberKey)
    return false
  }

  const setupChannel = await connector.createChannel()

  const storagedQueues = await getStoragedQueueOptions<Record<string, string>>(subscriberKey, {
    cache,
    kvLocal,
  })
  const queueOptions: typeof storagedQueues = {}

  //--------------------------
  // Create global exchanges
  //--------------------------
  await Promise.all([
    setupChannel.assertExchange(GLOBAL_EXCHANGE, 'topic', { durable: true }),
    setupChannel.assertExchange(DEADLETTER_EXCHANGE, 'direct', { durable: true }),
    setupChannel.assertExchange(SCHEDULER_EXCHANGE, 'direct', { durable: true }),
  ])

  const queuesPaths: string[] = []

  //--------------------------
  // Prepare Queues
  //--------------------------
  for await (const [queue, options, Subscriber] of subscribers) {
    queuesPaths.push(queue)
    const {
      includeInGlobalExchange,
      retryConfig,
      maxPriority,
      consumerChannels = 1,
      channelPrefetch = 1,
      ...baseOpts
    } = options
    const opts: Options.AssertQueue = baseOpts
    const fullQueuePath = qPath(queue)

    // Defaults
    opts.durable = opts.durable ?? true
    opts.deadLetterExchange = DEADLETTER_EXCHANGE
    opts.deadLetterRoutingKey = fullQueuePath

    // Priority
    if (maxPriority) opts.maxPriority = QUEUE_PRIORITY[maxPriority]

    const storagedOptions = storagedQueues[queue]
    const currentOpts = JSON.stringify(opts)
    queueOptions[queue] = currentOpts

    //--------------------------
    // Update Queues
    //--------------------------
    if (storagedOptions && storagedOptions !== currentOpts) {
      // Re create queue if has changed, or assert it
      const oldOptions = JSON.parse(storagedOptions)
      const messages = await connector.consumeAllMessages(
        fullQueuePath,
        oldOptions,
      )

      await setupChannel.deleteQueue(fullQueuePath, { ifEmpty: true })
      await setupChannel.assertQueue(fullQueuePath, opts)
      for (const message of messages) {
        setupChannel.sendToQueue(fullQueuePath, message.content, message.properties)
      }
    } else {
      await setupChannel.assertQueue(fullQueuePath, opts)
    }

    //--------------------------
    // Binding
    //--------------------------

    // Bind global exchange
    const globalExchangeBindings = [fullQueuePath, project, '__all__', `__all__.${queue}`]
    const bindingAction = includeInGlobalExchange ? 'bindQueue' : 'unbindQueue'

    await Promise.all(
      globalExchangeBindings.map((pattern) =>
        setupChannel[bindingAction](fullQueuePath, GLOBAL_EXCHANGE, pattern)
      ),
    )

    // Bind deadletter
    const dlq = dlqPath(fullQueuePath)
    await setupChannel.assertQueue(dlq, deadletterOpts)
    await setupChannel.bindQueue(dlq, DEADLETTER_EXCHANGE, fullQueuePath)

    // Bind scheduler
    const schq = schqPath(fullQueuePath)
    await setupChannel.assertQueue(schq, {
      ...schedulerOpts,
      deadLetterRoutingKey: fullQueuePath,
    })
    await setupChannel.bindQueue(schq, SCHEDULER_EXCHANGE, schq)
    await setupChannel.bindQueue(fullQueuePath, SCHEDULER_EXCHANGE, fullQueuePath)

    // Bind cron
    const cronq = schqPath(cronqPath(fullQueuePath))
    await setupChannel.assertQueue(cronq, {
      ...schedulerOpts,
      deadLetterRoutingKey: fullQueuePath,
    })
    await setupChannel.bindQueue(cronq, SCHEDULER_EXCHANGE, cronq)
    await setupChannel.bindQueue(fullQueuePath, SCHEDULER_EXCHANGE, fullQueuePath)

    //--------------------------
    // Prepare processor
    //--------------------------
    await Promise.all([...Array(consumerChannels).keys()].map(async () => {
      const consumerChannel = await connector.createChannel()
      consumerChannel.on('error', (e) => {
        logger.error(`Error occurred on the queue channel for queue: ${queue}`, {
          cause: e,
          meta: { source: 'zanix', queue, errorCode: e.code || 'UNKNOWN_ERROR' },
        })
      })
      consumerChannel.on('close', () => {
        logger.warn(`Queue channel has been closed for queue: ${queue}`, {
          meta: { source: 'zanix' },
        })
      })

      // Limits the number of unacknowledged messages per consumer channel,
      // controlling concurrency and backpressure for this queue.
      await consumerChannel.prefetch(channelPrefetch)
      await consumerChannel.consume(
        fullQueuePath,
        processorHandler(Subscriber, consumerChannel, {
          crons,
          secret,
          cache,
          execution,
          queue: fullQueuePath,
          retries: retryConfig,
        }),
        { noAck: false },
      )
    }))
  }

  const extraProcessChannel = await connector.createChannel()

  //--------------------------
  // Delete orphan queues
  //--------------------------
  const queuesToDelete = Object.entries(storagedQueues).filter((key) =>
    !queuesPaths.includes(key[0])
  )

  const promisesToDelete = queuesToDelete.map(async ([queue, options]) => {
    const fullQueuePath = qPath(queue)

    const deleteOptions = { ifUnused: true, ifEmpty: true }
    const dlq = dlqPath(fullQueuePath)
    const schq = schqPath(fullQueuePath)
    const cjq = schqPath(cronqPath(fullQueuePath))
    const queuesInfo = await Promise.all([
      checkQueue(connector, fullQueuePath),
      checkQueue(connector, dlq),
      checkQueue(connector, schq),
      checkQueue(connector, cjq),
    ])

    if (!queuesInfo.every((q) => q.isEmpty && q.isUnused)) {
      return queueOptions[queue] = options // preserve in storage
    }

    return Promise.all([
      extraProcessChannel.deleteQueue(fullQueuePath, deleteOptions),
      extraProcessChannel.deleteQueue(dlq, deleteOptions),
      extraProcessChannel.deleteQueue(schq, deleteOptions),
      extraProcessChannel.deleteQueue(cjq, deleteOptions),
    ])
  })
  await Promise.all(promisesToDelete)

  //--------------------------
  // Close Channels
  //--------------------------
  await Promise.all([setupChannel.close(), extraProcessChannel.close()])

  //--------------------------
  // Save queue data
  //--------------------------
  await storageQueueOptions(subscriberKey, queueOptions, { cache, kvLocal })
}
