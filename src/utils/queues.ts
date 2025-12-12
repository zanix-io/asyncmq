import type { IZanixQueue, QueueOptions } from 'typings/queues.ts'
import type { Channel, ConsumeMessage } from 'amqp'
import {
  cleanUpPipe,
  contextSettingPipe,
  type HandlerContext,
  type ZanixCacheProvider,
  type ZanixKVConnector,
} from '@zanix/server'

import { MESSAGE_HEADERS, QUEUES_METADATA_KEY } from './constants.ts'
import { decodeMessage } from './messages.ts'
import logger from '@zanix/logger'

export async function storageQueueOptions<T>(
  data: T,
  cache: ZanixCacheProvider,
  kvDb: ZanixKVConnector,
) {
  if (Deno.env.has('REDIS_URI')) {
    await cache.redis.set(QUEUES_METADATA_KEY, data)
  } else {
    logger.warn(
      'The queue setup system is currently using the local KV storage backend. ' +
        'For distributed deployments or more reliable persistence, consider enabling Redis by defining the REDIS_URI environment variable.',
      'noSave',
    )
    kvDb.set(QUEUES_METADATA_KEY, data)
  }
}

export function getStoragedQueueOptions<T>(
  cache: ZanixCacheProvider,
  kvDb: ZanixKVConnector,
): T | Promise<T> {
  return Deno.env.has('REDIS_URI')
    ? cache.redis.get<T>(QUEUES_METADATA_KEY).then((resp) => resp || {} as T)
    : kvDb.get<T>(QUEUES_METADATA_KEY) || {} as T
}

/**
 * Creates a message processor for a specific subscriber and queue.
 *
 * This method returns a function responsible for handling messages from the
 * given queue, applying the subscriber's logic, and optionally performing
 * retries according to the provided retry configuration.
 */
export const processorHandler = (
  Queue: new (ctx: HandlerContext) => IZanixQueue,
  channel: Channel,
  { queue, secret, retries = {} }: {
    queue: string
    retries?: QueueOptions['retryConfig']
    secret: string
  },
) => {
  const {
    maxRetries: globalMaxRetries = 0,
    // Default exponential backoff with a cap
    backoffStrategy = (attempt, options = {}) => {
      const { exponentialBackoffCoefficient = 2, exponentialTimeout = 15000 } = options
      return Math.min(1000 * exponentialBackoffCoefficient ** attempt, exponentialTimeout)
    },
  } = retries

  return async (msg: ConsumeMessage | null) => {
    if (!msg) return
    const headers = msg.properties?.headers || {}
    const context = JSON.parse(headers[MESSAGE_HEADERS.context])

    const messageContent = await decodeMessage(msg.content, secret)

    // Define request context
    context.payload.body = messageContent
    contextSettingPipe(context)

    const subscriber = new Queue(context)
    const attempt = msg.properties?.headers?.['x-attempt'] || 0
    try {
      await subscriber.onmessage(messageContent, { attempt, queue, context })
      channel.ack(msg)
    } catch (e) {
      const maxRetries = headers[MESSAGE_HEADERS.maxRetries] || globalMaxRetries
      const backoffOptions = headers[MESSAGE_HEADERS.backoffOptions]

      if (attempt < maxRetries) {
        const delay = backoffStrategy(attempt, backoffOptions)

        await new Promise((res) => setTimeout(res, delay))

        const newAttempt = attempt + 1
        channel.sendToQueue(queue, msg.content, {
          ...msg.properties,
          headers: { ...headers, 'x-attempt': newAttempt },
        })

        subscriber.onerror(messageContent, e, {
          requeued: true,
          attempt: newAttempt,
          queue,
          context,
        })
        channel.ack(msg)
      } else {
        subscriber.onerror(messageContent, e, { requeued: false, attempt, queue, context })
        // Send to dead letters
        channel.nack(msg, false, false)
      }
    }

    // Clean request context and scoped instances
    cleanUpPipe(context)
  }
}
