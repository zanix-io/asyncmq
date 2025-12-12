import type { ZanixClassDecorator } from '@zanix/server'
import type { QueueDecoratorOptions } from 'typings/queues.ts'

import { defineQueueDecorator } from './assembly.ts'

/**
 * Class decorator for defining an asynchronous Queue API endpoint.
 *
 * This decorator registers the class as an Async Queue handler. It can be used
 * either with a simple route string or with a detailed configuration object.
 *
 * @param {QueueDecoratorOptions | string} [options] - Optional configuration object for advanced setup.
 *                            - Or the route path for the Async Queue. If this argument is provided,
 *                              the decorator registers the class to handle requests at the specified route.
 *
 * @returns {ZanixClassDecorator} The class decorator that registers the class as an Async Queue handler.
 *
 * @example
 * // Simple route usage
 * @Queue('/queue/endpoint')
 * class QueueHandler {}
 *
 * @example
 * // Detailed options usage
 * @Queue({
 *   route: '/queue/endpoint',
 *   rto: SomeRequestTransferObject,
 *   Interactor: SomeInteractorClass
 * })
 * class QueueHandler {}
 */
export function Queue(
  options?: QueueDecoratorOptions | string,
): ZanixClassDecorator {
  return defineQueueDecorator(options)
}
