import type { MessageQueue, QueueMessageOptions, ScopedContext } from '@zanix/server'
import type { Options } from 'amqp'

import { MESSAGE_HEADERS, QUEUE_PRIORITY } from 'utils/constants.ts'
import { decrypt, encrypt } from '@zanix/helpers'
import { prepareContext } from 'utils/context.ts'
import { Buffer } from 'node:buffer'

export const prepareOptions = async (
  options: QueueMessageOptions,
  secret: string,
  getContext: (id: string) => ScopedContext,
) => {
  const { retryConfig: { maxRetries, backoffOptions } = {}, priority, contextId, ...baseOpts } =
    options
  const opts: Options.Publish = baseOpts

  const context = prepareContext(getContext, contextId)

  // Headers
  opts.headers = {
    ...options.headers,
    [MESSAGE_HEADERS.context]: await encode(context, secret),
    [MESSAGE_HEADERS.maxRetries]: maxRetries,
    [MESSAGE_HEADERS.backoffOptions]: backoffOptions,
  }

  // Priority
  if (typeof priority === 'string') opts.priority = QUEUE_PRIORITY[priority]

  // Defaults
  opts.persistent = opts.persistent ?? true

  return opts
}

export const encode = async (message: MessageQueue | null, secret: string) =>
  message ? Buffer.from(await encrypt(JSON.stringify(message), secret)) : Buffer.from('')

export const decode = async (message: Buffer<ArrayBufferLike>, secret: string) =>
  message.length ? JSON.parse(await decrypt(message.toString(), secret)) : ''
