import type {
  Execution,
  IZanixSubscriber,
  QueueOptions,
  SubscriberDecoratorOptions,
  SubscriberMetadata,
} from 'typings/queues.ts'
import type { BaseRTO } from '@zanix/validator'
import {
  getTargetKey,
  type HandlerContext,
  ProgramModule,
  type ZanixClassDecorator,
} from '@zanix/server'
import { InternalError } from '@zanix/errors'
import { ZanixSubscriber } from '../base.ts'
import { SUBSCRIBERS_METADATA_KEY } from 'utils/constants.ts'

/** Define decorator to register a queue */
export function defineSubscriberDecorator(
  options?: SubscriberDecoratorOptions | string,
): ZanixClassDecorator {
  let route: string
  let interactor: string | undefined
  let queueOptions: QueueOptions = {}
  let execution: Execution = 'main-process'

  let rto: new (ctx?: unknown) => BaseRTO
  if (typeof options === 'string') {
    route = options
  } else if (options) {
    const optsRto = options.rto
    if (optsRto) {
      if (typeof optsRto !== 'object') rto = optsRto
      else rto = optsRto
    }
    interactor = getTargetKey(options.Interactor)

    if (typeof options.queue === 'string') {
      route = options.queue
    } else {
      execution = options.queue.execution || execution
      queueOptions = { ...options.queue.settings }
      route = options.queue.topic
    }
  }

  const subscriberKey = SUBSCRIBERS_METADATA_KEY[execution]

  ZanixSubscriber.prototype.requestValidationPipe
  const subscribers = ProgramModule.registry.get<SubscriberMetadata[]>(subscriberKey) || []
  const extraProcessSubscribers = ProgramModule.registry.get<SubscriberMetadata[]>(
    execution === 'main-process'
      ? SUBSCRIBERS_METADATA_KEY['extra-process']
      : SUBSCRIBERS_METADATA_KEY['main-process'],
  ) || []

  const exist = [...subscribers, ...extraProcessSubscribers].find(([queue]) => queue === route)

  if (exist) {
    throw new InternalError(
      `Conflict: A Queue with the same path or name ("${
        exist[0]
      }") is already configured in the system. The conflict occurred in a Subscriber of type ${
        exist[2].constructor.name
      }.`,
      {
        meta: {
          source: 'zanix',
          queueName: exist[0],
          queueOptions: exist[1],
          conflictingQueue: {
            type: exist[2].constructor.name,
            instance: exist[2],
          },
          errorDetails: {
            message:
              'The specified queue name or path already exists, preventing a new configuration with the same identifier.',
          },
        },
      },
    )
  }

  return function (Target) {
    if (!(Target.prototype instanceof ZanixSubscriber)) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid Subscriber. Please extend ${ZanixSubscriber.name}`,
        { meta: { target: Target.name, baseTarget: ZanixSubscriber.name } },
      )
    }

    Target.prototype['_znx_props_'] = {
      ...Target.prototype['_znx_props_'],
      lifetime: 'TRANSIENT',
      data: { interactor, rto },
    }

    subscribers.push([
      route,
      queueOptions,
      Target as unknown as new (ctx: HandlerContext) => IZanixSubscriber,
    ])

    ProgramModule.registry.set(subscriberKey, subscribers)
  }
}
