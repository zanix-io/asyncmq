import type { OnMessageInfo, QueueOptions } from 'typings/queues.ts'

import { ZanixCoreAsyncMQProvider } from 'modules/rabbitmq/provider/mod.ts'
import { Interactor, ZanixInteractor } from '@zanix/server'
import { Queue } from 'modules/queues/decorators/base.ts'
import { ZanixQueue } from 'modules/queues/base.ts'
import { assert, assertAlmostEquals, assertEquals } from '@std/assert'
import { BaseRTO, IsString, isUUID } from '@zanix/validator'
import { registerCronJob } from 'modules/jobs/defs.ts'

console.info = () => {}
console.warn = () => {}

const registerProvider = async () => {
  Deno.env.set('AMQP_URI', 'amqp://guest:guest@localhost:5672/')

  await import('jsr:@zanix/datamaster@0.x/core')
  await import('../../modules/rabbitmq/defs.ts')
  return new ZanixCoreAsyncMQProvider()
}

const registerQueue = async (
  queue: string,
  // deno-lint-ignore no-explicit-any
  options?: QueueOptions & { callback?: (info: any) => void },
) => {
  @Interactor()
  class _Interactor extends ZanixInteractor {
    public getCtx() {
      return this.context.id
    }
  }
  class Rto extends BaseRTO {
    @IsString({ expose: true })
    accessor message!: string
  }

  let calls = 0
  let errors = 0
  const { callback, ...opts } = options || {}
  await new Promise((resolve) => {
    @Queue({ queue, Interactor: _Interactor, rto: Rto, settings: opts })
    class _Queue extends ZanixQueue<_Interactor> {
      public onmessage(data: { message: string }, info: OnMessageInfo) {
        assertEquals(data.message, 'hello queue')
        assert(info.requeuedFromDeadLetter ? info.attempt === 2 : info.attempt >= 0)
        assert(isUUID(this.interactor.getCtx()))
        calls++
        callback?.(info)

        setTimeout(() => {
          resolve(true)
        }, info.cron ? 10000 : 500) // wait until ack
      }

      public override onerror(data: { message: string }, error: unknown): void {
        assert(!!error)
        assertEquals(data.message, 'hello queue')
        errors++
      }
    }
  })

  return { calls, errors }
}

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'ZanixRabbitMQ provider should enqueue',
  fn: async () => {
    const queue = 'test-queue'
    const provider = await registerProvider()
    setTimeout(() => {
      provider.enqueue(queue, { message: 'hello queue' }, { isInternal: true, contextId: '' })
    }, 100)

    await registerQueue(queue)
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'ZanixRabbitMQ provider should send message to queue',
  fn: async () => {
    const queue = 'test-message-queue'
    const provider = await registerProvider()
    const message = { message: 'hello queue' }
    setTimeout(() => {
      provider.sendMessage('', message, { contextId: '', isInternal: true }) // all internal queues
      provider.sendMessage(queue, message, { contextId: '', isInternal: true }) // internal specific queue
      provider.sendMessage('*', message, { contextId: '' }) // all queues
      provider.sendMessage(`*.${queue}`, message, { contextId: '' }) // all specific queues
      provider.sendMessage(`none.${queue}`, message, { contextId: '' })
    }, 100)

    const { calls } = await registerQueue(queue, { includeInGlobalExchange: true })
    assertEquals(calls, 4)
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'ZanixRabbitMQ provider should setup scheduler queue with delay',
  fn: async () => {
    const queue = 'schedule-test-queue'
    const provider = await registerProvider()
    const start = Date.now()
    setTimeout(() => {
      provider.schedule(queue, { message: 'hello queue' }, {
        isInternal: true,
        contextId: '',
        delay: 5000,
      })
    }, 100)

    await registerQueue(queue)
    assertAlmostEquals((Date.now() - start) / 1000, 5, 1)
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'ZanixRabbitMQ provider should setup scheduler queue with date',
  fn: async () => {
    const queue = 'schedule-test-queue-date'
    const provider = await registerProvider()
    const start = Date.now()
    setTimeout(() => {
      provider.schedule(queue, { message: 'hello queue' }, {
        isInternal: true,
        contextId: '',
        date: new Date(start + 5000),
      })
    }, 100)

    await registerQueue(queue)
    assertAlmostEquals((Date.now() - start) / 1000, 5, 2)
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'ZanixRabbitMQ provider should works with deadletter',
  fn: async () => {
    const queue = 'test-queue-deadletter'
    const provider = await registerProvider()

    setTimeout(() => {
      provider.enqueue(queue, { message: 'hello queue' }, {
        isInternal: true,
        contextId: '',
      })
    }, 100)

    setTimeout(() => {
      provider.requeueDeadLetters(queue)
    }, 500)

    const { calls, errors } = await registerQueue(queue, {
      retryConfig: { maxRetries: 2, backoffStrategy: false },
      callback: (info) => {
        if (!info.requeuedFromDeadLetter) {
          throw new Error()
        }
      },
    })

    assertEquals(calls, 4) // 1 attempt + 2 retries + 1 requeued
    assertEquals(errors, 3) // 1 attempt + 2 retries
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'ZanixRabbitMQ provider crons should works',
  fn: async () => {
    const queue = 'test-queue-cron'
    const start = Date.now()
    registerCronJob({
      name: 'my-cron',
      isActive: true,
      args: { message: 'hello queue' },
      queue: queue,
      schedule: '*/2 * * * * *',
      settings: {
        correlationId: 'id',
      },
    })
    setTimeout(() => {
      registerProvider()
    }, 100)

    const { calls } = await registerQueue(queue)

    assert(calls === 5 || calls === 6)

    assertAlmostEquals(Math.floor((Date.now() - start) / 1000), 10, 1)
  },
})
