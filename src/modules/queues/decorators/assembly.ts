import type {
  IZanixQueue,
  QueueDecoratorOptions,
  QueueOptions,
  SubscriberMetadata,
} from 'typings/queues.ts'
import type { BaseRTO } from '@zanix/validator'
import {
  getTargetKey,
  type HandlerContext,
  ProgramModule,
  type ZanixClassDecorator,
  type ZanixConnector,
} from '@zanix/server'
import { InternalError } from '@zanix/errors'
import { ZanixQueue } from '../base.ts'
import { QUEUES_METADATA_KEY } from 'utils/constants.ts'

/** Connector module setup init mode */
export const connectorModuleInitialization = (instance: ZanixConnector) => {
  const timeout = instance['timeoutConnection']
  const retryInterval = instance['retryInterval']

  // Check for healthy
  const waitForHealthWithTimeout = (): Promise<boolean> => {
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const checkHealth = async () => {
        const healthy = await instance.isHealthy()

        if (healthy) return resolve(true)

        if (Date.now() - startTime > timeout) {
          reject(
            new InternalError('Health check failed: Timeout reached', {
              meta: {
                connectorName: instance.constructor.name,
                method: 'isHealthy',
                timeoutDuration: timeout,
                retryInterval: retryInterval,
                source: 'zanix',
              },
            }),
          )
        } else {
          setTimeout(checkHealth, retryInterval)
        }
      }

      checkHealth()
    })
  }

  // Wait for healthy
  return new Promise((resolve, reject) => {
    instance.isReady
      .then(async () => {
        try {
          const healthy = await waitForHealthWithTimeout()
          resolve(healthy)
        } catch (error) {
          reject(error)
        }
      })
      .catch(reject)
  })
}

/** Define decorator to register a queue */
export function defineQueueDecorator(
  options?: QueueDecoratorOptions | string,
): ZanixClassDecorator {
  let route: string
  let interactor: string | undefined
  let queueOptions: QueueOptions = {}
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
    route = options.queue
    queueOptions = { ...queueOptions, ...options.settings }
  }

  return function (Target) {
    if (!(Target.prototype instanceof ZanixQueue)) {
      throw new InternalError(
        `The class '${Target.name}' is not a valid Queue. Please extend ${ZanixQueue.name}`,
        { meta: { target: Target.name, baseTarget: ZanixQueue.name } },
      )
    }

    Target.prototype['_znx_props_'] = {
      ...Target.prototype['_znx_props_'],
      lifetime: 'TRANSIENT',
      data: { interactor, rto },
    }

    ZanixQueue.prototype.requestValidationPipe
    const queues = ProgramModule.registry.get<SubscriberMetadata[]>(QUEUES_METADATA_KEY) || []

    const exist = queues.find(([queue]) => queue === route)
    if (exist) {
      throw new InternalError(
        `Conflict: A Queue with the same path or name ("${
          exist[0]
        }") is already configured in the system. The conflict occurred with Queue of type ${
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

    queues.push([
      route,
      queueOptions,
      Target as unknown as new (ctx: HandlerContext) => IZanixQueue,
    ])

    ProgramModule.registry.set(QUEUES_METADATA_KEY, queues)
  }
}
