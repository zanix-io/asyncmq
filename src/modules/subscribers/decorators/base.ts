import type { ZanixClassDecorator } from '@zanix/server'
import type { SubscriberDecoratorOptions } from 'typings/queues.ts'

import { defineSubscriberDecorator } from './assembly.ts'

/**
 * Class decorator for defining a Subscriber API endpoint.
 *
 * This decorator registers the class as a Subscriber handler. It can be used
 * either with a simple route string or with a detailed configuration object.
 *
 * @param {SubscriberDecoratorOptions | string} [options] - Optional configuration object for advanced setup.
 *                            - Or the route path for the Async Queue. If this argument is provided,
 *                              the decorator registers the class to handle requests at the specified route.
 *
 * @returns {ZanixClassDecorator} The class decorator that registers the class as a Subscriber handler.
 *
 * @throws {InternalError} If the decorated class doesn't extend `ZanixSubscriber`, or if another
 *   Subscriber is already registered under the same route/queue.
 *
 * @example
 * // Simple route usage
 * @Subscriber('/queue/endpoint')
 * class SubscriberHandler extends ZanixSubscriber {}
 *
 * @example
 * // Detailed options usage
 * @Subscriber({
 *   queue: '/queue/endpoint',
 *   rto: SomeRequestTransferObject,
 *   Interactor: SomeInteractorClass
 * })
 * class SubscriberHandler extends ZanixSubscriber {}
 */
export function Subscriber(
  options?: SubscriberDecoratorOptions | string,
): ZanixClassDecorator {
  return defineSubscriberDecorator(options)
}
