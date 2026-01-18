import { assertAlmostEquals, assertEquals } from '@std/assert'
import { registerProvider, registerQueue } from './__setup__.ts'

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
        messageId: Date.now().toString(),
        delay: 5000,
      })
    }, 100)

    await registerQueue(queue)

    assertAlmostEquals((Date.now() - start) / 1000, 5, 2)
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
        messageId: Date.now().toString(),
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
  name: 'ZanixRabbitMQ provider should send message to deadletter',
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
  name: 'ZanixRabbitMQ provider should send message to deadletter with delay',
  fn: async () => {
    const queue = 'test-queue-deadletter-back'
    const provider = await registerProvider()

    setTimeout(() => {
      provider.enqueue(queue, { message: 'hello queue' }, {
        isInternal: true,
        contextId: '',
      })
    }, 100)

    setTimeout(() => {
      provider.requeueDeadLetters(queue)
    }, 5000)

    const { calls, errors } = await registerQueue(queue, {
      retryConfig: { maxRetries: 2 },
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
