import type { IZanixQueue } from 'typings/queues.ts'
import type { BaseRTO } from '@zanix/validator'

import logger from '@zanix/logger'
import { ApplicationError } from '@zanix/errors'
import {
  type HandlerContext,
  HandlerGenericClass,
  type ZanixInteractorGeneric,
} from '@zanix/server'

/**
 * Abstract class `ZanixQueue` that extends `HandlerGenericClass`.
 * This class represents a queue that handles asynchronous interactions through
 * a generic `Interactor` type. The queue is likely used to manage messages or events
 * in an event-driven or asynchronous task system.
 *
 * @template Interactor - The type of interaction associated with the queue. Defaults to `never`,
 * but can be specified to better type the interaction.
 *
 * @extends {HandlerGenericClass<Interactor, IZanixQueue[keyof IZanixQueue]>}
 *
 * @abstract
 */
export abstract class ZanixQueue<Interactor extends ZanixInteractorGeneric = never>
  extends HandlerGenericClass<Interactor, IZanixQueue[keyof IZanixQueue]> {
  constructor(context: HandlerContext) {
    super(context.id)

    const currentOnMessage = this.onmessage.bind(this)

    this.onmessage = function (message, info) {
      const rto = this['_znx_props_'].data.rto as undefined | (new (ctx?: unknown) => BaseRTO)

      return rto
        ? this.requestValidation({ Body: rto }, context).then((payload) => {
          return currentOnMessage(payload.body, info)
        }).catch((error) => {
          throw new ApplicationError('Data validation Error', { cause: error.cause, id: error.id })
        })
        : currentOnMessage(message, info)
    }
  }

  /**
   * Event triggered when a message is received via the AsyncMQ.
   *
   * @param {any} message - The message event.
   */
  protected abstract onmessage(
    // deno-lint-ignore no-explicit-any
    message: any,
    info: { attempt: number; queue: string; context: Record<string, unknown> },
  ): Promise<void> | void

  /**
   * Event triggered when an error occurs on the AsyncMQ.
   * Should be overridden to handle errors with custom logic.
   */
  protected onerror(
    // deno-lint-ignore no-explicit-any
    _message: any,
    error: unknown,
    info: { requeued: boolean; attempt: number; queue: string; context: Record<string, unknown> },
  ) {
    // deno-lint-ignore no-explicit-any
    ;(error as any).meta = {
      target: this.constructor.name,
      queue: info.queue,
      requeued: info.requeued,
      attempt: info.attempt,
    }

    logger.error(`An error occurred on the asyncmq queue "${info.queue}"`, error, 'noSave')
  }
}
