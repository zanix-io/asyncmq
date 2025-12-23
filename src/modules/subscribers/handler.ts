import type { Execution, IZanixSubscriber, MessageInfo, QueueOptions } from 'typings/queues.ts'
import type { CronRegistry } from 'typings/crons.ts'
import type { Channel, ConsumeMessage } from 'amqp'

import {
  cleanUpPipe,
  contextSettingPipe,
  type HandlerContext,
  type ZanixCacheProvider,
} from '@zanix/server'
import { MESSAGE_HEADERS, SCHEDULER_EXCHANGE } from 'utils/constants.ts'
import { cronqPath, qPath, schqPath } from '../rabbitmq/provider/setup.ts'
import { lockMessage, unlockMessage } from 'utils/queues.ts'
import { decode } from '../rabbitmq/provider/messages.ts'
import { nextCronDate } from 'utils/cron.ts'

/**
 * Creates a message processor for a specific subscriber and queue.
 *
 * This method returns a function responsible for handling messages from the
 * given queue, applying the subscriber's logic, and optionally performing
 * retries according to the provided retry configuration.
 */
export const processorHandler = (
  Subscriber: new (ctx: HandlerContext) => IZanixSubscriber,
  channel: Channel,
  { queue, secret, cache, crons = [], retries = {} }: {
    crons?: CronRegistry[]
    execution?: Execution
    cache: ZanixCacheProvider
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

  const cronEntries = Object.fromEntries(crons)

  return async (msg: ConsumeMessage | null) => {
    if (!msg) return
    const messageId = msg.properties.messageId
    const canRun = await lockMessage(messageId, cache)
    if (!canRun) return

    const headers = msg.properties?.headers || {}
    const [context, messageContent] = await Promise.all([
      decode(headers[MESSAGE_HEADERS.context], secret),
      decode(msg.content, secret),
    ])

    // Define request context
    context.payload.body = messageContent
    contextSettingPipe(context)

    const subscriber = new Subscriber(context)
    const attempt = headers['x-attempt'] || 0
    const baseInfo: MessageInfo = { attempt, queue, context, messageId }

    const rqFromDL = headers[MESSAGE_HEADERS.rqFromDL]
    if (rqFromDL) baseInfo.requeuedFromDeadLetter = true

    // Cron scheduler
    const cronIdentifier = headers[MESSAGE_HEADERS.cronIdentifier]
    if (cronIdentifier) {
      const cron = cronEntries[cronIdentifier]
      if (!cron?.isActive) {
        channel.nack(msg, false, false)
        return
      }

      const options = { ...msg.properties, ...cron.settings }

      const nextExecution = nextCronDate(cron.schedule)
      baseInfo.cron = { nextExecution, name: cronIdentifier, expression: cron.schedule }

      const now = Date.now()
      const nextExecutionTime = nextExecution.getTime()
      options.expiration = nextExecutionTime - now

      // lock publish
      const canPublish = await lockMessage(
        `publish:cron:${messageId}:${Math.floor(nextExecutionTime / 1000)}`,
        cache,
      )

      if (canPublish) {
        channel.publish(
          SCHEDULER_EXCHANGE,
          schqPath(cronqPath(qPath(cron.queue))),
          msg.content,
          options,
        )
      }
    }

    // Handler execution
    try {
      await subscriber.onmessage(messageContent, baseInfo)
      channel.ack(msg)
      await unlockMessage(messageId, cache)
    } catch (e) {
      const maxRetries = headers[MESSAGE_HEADERS.maxRetries] ?? globalMaxRetries
      const backoffOptions = headers[MESSAGE_HEADERS.backoffOptions]

      if (attempt < maxRetries) {
        if (backoffStrategy) {
          const delay = backoffStrategy(attempt, backoffOptions)
          await new Promise((res) => setTimeout(res, delay))
        }

        const newAttempt = attempt + 1

        subscriber.onerror(messageContent, e, {
          ...baseInfo,
          requeued: true,
          attempt: newAttempt,
        })

        channel.ack(msg)
        await unlockMessage(messageId, cache)

        channel.sendToQueue(queue, msg.content, {
          ...msg.properties,
          headers: { ...headers, 'x-attempt': newAttempt },
        })
      } else {
        subscriber.onerror(messageContent, e, { requeued: false, ...baseInfo })
        // Send to dead letters
        channel.nack(msg, false, false)
        await unlockMessage(messageId, cache)
      }
    }

    // Clean request context and scoped instances
    cleanUpPipe(context)
  }
}
