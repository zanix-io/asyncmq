import type { HandlerContext, QueueMessageOptions, ScopedContext } from '@zanix/server'
import type { Options } from 'amqp'

import { MESSAGE_HEADERS, QUEUE_PRIORITY } from './constants.ts'
import { decrypt, encrypt, generateUUID } from '@zanix/helpers'
import { Buffer } from 'node:buffer'

export const prepareOptions = (
  options: QueueMessageOptions,
  getContext: (id: string) => ScopedContext,
) => {
  const { retryConfig: { maxRetries, backoffOptions } = {}, priority, contextId, ...baseOpts } =
    options
  const opts: Options.Publish = baseOpts

  const scopedContext = contextId ? getContext(contextId) : undefined
  const context: Omit<HandlerContext, 'req' | 'url'> = {
    id: scopedContext?.id || generateUUID(),
    cookies: scopedContext?.cookies || {},
    locals: scopedContext?.locals || {},
    payload: { params: {}, search: {}, body: {} },
  }

  // Headers
  opts.headers = {
    ...options.headers,
    [MESSAGE_HEADERS.context]: JSON.stringify(context),
    [MESSAGE_HEADERS.maxRetries]: maxRetries,
    [MESSAGE_HEADERS.backoffOptions]: backoffOptions,
  }

  // Priority
  if (typeof priority === 'string') opts.priority = QUEUE_PRIORITY[priority]

  // Defaults
  opts.persistent = opts.persistent ?? true

  return opts
}

export const encodeMessage = async (message: string | Record<string, unknown>, secret: string) =>
  Buffer.from(await encrypt(JSON.stringify(message), secret))

export const decodeMessage = async (message: Buffer<ArrayBufferLike>, secret: string) =>
  JSON.parse(await decrypt(message.toString(), secret))
