import type { ErrorInfo, IZanixSubscriber, MessageInfo } from 'typings/queues.ts'
import type { BaseRTO } from '@zanix/validator'

import logger from '@zanix/logger'
import { ApplicationError } from '@zanix/errors'
import {
  type HandlerContext,
  HandlerGenericClass,
  type ZanixInteractorGeneric,
} from '@zanix/server'

/**
 * Abstract class `ZanixSubscriber` that extends `HandlerGenericClass`.
 * This class represents a subscriber that handles asynchronous interactions through
 * a generic `Interactor` type. The subscriber is likely used to manage messages or events
 * in an event-driven or asynchronous task system.
 *
 * @template Interactor - The type of interaction associated with the subscriber. Defaults to `never`,
 * but can be specified to better type the interaction.
 *
 * @extends {HandlerGenericClass<Interactor, IZanixSubscriber[keyof IZanixSubscriber]>}
 *
 * @abstract
 */
export abstract class ZanixSubscriber<Interactor extends ZanixInteractorGeneric = never>
  extends HandlerGenericClass<Interactor, IZanixSubscriber[keyof IZanixSubscriber]> {
  constructor(context: HandlerContext) {
    super(context.id)

    const currentOnMessage = this.onmessage.bind(this)

    this.onmessage = function (message, info) {
      const rto = this['_znx_props_'].data.rto as undefined | (new (ctx?: unknown) => BaseRTO)

      return rto
        ? this.requestValidation({ Body: rto }, context).catch((error) => {
          throw new ApplicationError('Data validation Error', { cause: error.cause, id: error.id })
        }).then((payload) => {
          return currentOnMessage(payload.body, info)
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
    info: MessageInfo,
  ): Promise<void> | void

  /**
   * Event triggered when an error occurs on the AsyncMQ.
   * Should be overridden to handle errors with custom logic.
   */
  protected onerror(
    // deno-lint-ignore no-explicit-any no-unused-vars
    message: any,
    error: unknown,
    info: ErrorInfo,
  ) {
    // deno-lint-ignore no-explicit-any
    ;(error as any).meta = {
      target: this.constructor.name,
      queue: info.queue,
      requeued: info.requeued,
      attempt: info.attempt,
    }

    logger.error(
      `An error occurred in the queue subscriber for topic "${info.queue}"`,
      error,
      'noSave',
    )
  }
}
