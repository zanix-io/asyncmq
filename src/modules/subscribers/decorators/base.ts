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
 * @example
 * // Simple route usage
 * @Subscriber('/queue/endpoint')
 * class SubscriberHandler {}
 *
 * @example
 * // Detailed options usage
 * @Subscriber({
 *   queue: '/queue/endpoint',
 *   rto: SomeRequestTransferObject,
 *   Interactor: SomeInteractorClass
 * })
 * class SubscriberHandler {}
 */
export function Subscriber(
  options?: SubscriberDecoratorOptions | string,
): ZanixClassDecorator {
  return defineSubscriberDecorator(options)
}
