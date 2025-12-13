import type { ZanixCacheProvider, ZanixKVConnector } from '@zanix/server'
import type { ZanixRabbitMQConnector } from '../connector.ts'
import type { SubscriberMetadata } from 'typings/queues.ts'
import type { Channel, Options } from 'amqp'

import { getStoragedQueueOptions, storageQueueOptions } from 'utils/queues.ts'
import { processorHandler } from 'modules/queues/handler.ts'
import {
  DEADLETTER_EXCHANGE,
  GLOBAL_EXCHANGE,
  QUEUE_PRIORITY,
  QUEUES_METADATA_KEY,
  SCHEDULER_EXCHANGE,
} from 'utils/constants.ts'
import { readConfig } from '@zanix/helpers'

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

const checkQueue = async (channel: Channel, queueName: string) => {
  const q = await channel.checkQueue(queueName)
  return { isUnused: q.consumerCount === 0, isEmpty: q.messageCount === 0, queueName }
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
export async function setup(
  options: {
    connector: ZanixRabbitMQConnector
    channel: Channel
    tmpChannel: Channel
    queues?: SubscriberMetadata[]
    kvLocal: ZanixKVConnector
    cache: ZanixCacheProvider
    secret: string
  },
) {
  const { channel, tmpChannel, queues, kvLocal, cache, connector, secret } = options

  if (!queues) {
    kvLocal.delete(QUEUES_METADATA_KEY)
    return false
  }

  const storagedQueues = await getStoragedQueueOptions<Record<string, string>>(
    cache,
    kvLocal,
  )
  const queueOptions: typeof storagedQueues = {}

  // Create global exchanges
  await Promise.all([
    channel.assertExchange(GLOBAL_EXCHANGE, 'topic', { durable: true }),
    channel.assertExchange(DEADLETTER_EXCHANGE, 'direct', { durable: true }),
    channel.assertExchange(SCHEDULER_EXCHANGE, 'direct', { durable: true }),
  ])

  const queuesPaths: string[] = []

  // Prepare Queues
  for await (const [queue, options, Queue] of queues) {
    queuesPaths.push(queue)
    const { includeInGlobalExchange, retryConfig, maxPriority, ...baseOpts } = options
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

    // Re create queue if has changed, or assert it
    if (storagedOptions && storagedOptions !== currentOpts) {
      const oldOptions = JSON.parse(storagedOptions)
      const messages = await connector.consumeAllMessages(
        fullQueuePath,
        oldOptions,
      )

      await channel.deleteQueue(fullQueuePath, { ifEmpty: true })
      await channel.assertQueue(fullQueuePath, opts)
      for (const message of messages) {
        channel.sendToQueue(fullQueuePath, message.content, message.properties)
      }
    } else {
      await channel.assertQueue(fullQueuePath, opts)
    }

    // Bind global exchange
    const globalExchangeBindings = [fullQueuePath, project, '__all__', `__all__.${queue}`]
    const bindingAction = includeInGlobalExchange ? 'bindQueue' : 'unbindQueue'

    await Promise.all(
      globalExchangeBindings.map((pattern) =>
        channel[bindingAction](fullQueuePath, GLOBAL_EXCHANGE, pattern)
      ),
    )

    // Bind deadletter
    const dlq = dlqPath(fullQueuePath)
    await channel.assertQueue(dlq, deadletterOpts)
    await channel.bindQueue(dlq, DEADLETTER_EXCHANGE, fullQueuePath)

    // Bind scheduler
    const schq = schqPath(fullQueuePath)
    await channel.assertQueue(schq, {
      ...schedulerOpts,
      deadLetterRoutingKey: fullQueuePath,
    })
    await channel.bindQueue(schq, SCHEDULER_EXCHANGE, schq)
    await channel.bindQueue(fullQueuePath, SCHEDULER_EXCHANGE, fullQueuePath)

    // Bind cron
    const cronq = schqPath(cronqPath(fullQueuePath))
    await channel.assertQueue(cronq, {
      ...schedulerOpts,
      deadLetterRoutingKey: fullQueuePath,
    })
    await channel.bindQueue(cronq, SCHEDULER_EXCHANGE, cronq)
    await channel.bindQueue(fullQueuePath, SCHEDULER_EXCHANGE, fullQueuePath)

    // Prepare processor
    await channel.consume(
      fullQueuePath,
      processorHandler(Queue, channel, {
        secret,
        queue: fullQueuePath,
        retries: retryConfig,
      }),
    )
  }

  // Delete orphan queues
  const queuesToDelete = Object.entries(storagedQueues).filter((key) =>
    !queuesPaths.includes(key[0])
  )

  const promisesToDelete = queuesToDelete.map(async ([queue, options]) => {
    const fullQueuePath = qPath(queue)

    const deleteOptions = { ifUnused: true, ifEmpty: true }

    const queuesInfo = await Promise.all([
      checkQueue(tmpChannel, fullQueuePath),
      checkQueue(tmpChannel, dlqPath(fullQueuePath)),
      checkQueue(tmpChannel, schqPath(fullQueuePath)),
      checkQueue(tmpChannel, schqPath(cronqPath(fullQueuePath))),
    ])

    if (!queuesInfo.every((q) => q.isEmpty && q.isUnused)) {
      return queueOptions[queue] = options // preserve in storage
    }

    return Promise.all([
      tmpChannel.deleteQueue(fullQueuePath, deleteOptions),
      tmpChannel.deleteQueue(dlqPath(fullQueuePath), deleteOptions),
      tmpChannel.deleteQueue(schqPath(fullQueuePath), deleteOptions),
      tmpChannel.deleteQueue(schqPath(cronqPath(fullQueuePath)), deleteOptions),
    ])
  })
  await Promise.all(promisesToDelete)
  await tmpChannel.close()

  await storageQueueOptions(queueOptions, cache, kvLocal)
}
