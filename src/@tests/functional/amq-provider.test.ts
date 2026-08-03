import { assertAlmostEquals, assertEquals, assertRejects } from '@std/assert'
import { registerProvider, registerQueue } from './__setup__.ts'
import { ApplicationError } from '@zanix/errors'

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

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'ZanixRabbitMQ provider should enqueue directly to the raw queue name when not internal',
  fn: async () => {
    const provider = await registerProvider()

    const result = await provider.enqueue('raw-external-queue', { message: 'hello queue' }, {
      contextId: '',
    })

    assertEquals(typeof result, 'boolean')
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'ZanixRabbitMQ provider should throw when the schedule expiration has already passed',
  fn: async () => {
    const provider = await registerProvider()

    await assertRejects(
      () =>
        provider.schedule('past-schedule-queue', { message: 'hello queue' }, {
          isInternal: true,
          contextId: '',
          delay: -5000,
        }),
      ApplicationError,
      'Queue expiration schedule is invalid',
    )
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'ZanixRabbitMQ provider should recreate and migrate a queue when its stored options change',
  fn: async () => {
    const queue = 'priority-reconfig-queue'

    // Round 1: create the queue with default options and let `setup()` finish and persist them.
    registerQueue(queue)
    await registerProvider()
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Round 2: same queue, different options (`maxPriority`) — `setup()` must detect the stored
    // config changed, recreate the queue (migrating any in-flight messages) instead of just
    // asserting it, and the recreated queue must still deliver messages correctly.
    const secondRound = registerQueue(queue, { maxPriority: 'high' })
    const provider = await registerProvider()
    await new Promise((resolve) => setTimeout(resolve, 1500))

    provider.enqueue(queue, { message: 'hello queue' }, { isInternal: true, contextId: '' })

    const { calls } = await secondRound
    assertEquals(calls, 1)
  },
})
