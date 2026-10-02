import amqp from 'amqp'
import { assertEquals } from '@std/assert'
import logger from '@zanix/logger'
import { registerProvider } from '../functional/__setup__.ts'

/**
 * A publish that no queue can receive used to vanish without a trace: RabbitMQ accepts it and
 * drops it, and the publisher's confirmation still comes back as a success. The provider now
 * publishes `enqueue()` and `schedule()` as `mandatory`, so the broker hands such a message back
 * and the provider logs it with the routing key.
 */

const URI = 'amqp://guest:guest@localhost:5672/'

const options = { sanitizeOps: false, sanitizeResources: false }
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Collects what `logger.error` receives while `run` executes. */
async function captureErrors(run: () => Promise<void>): Promise<string[]> {
  const errors: string[] = []
  const original = logger.error
  logger.error = ((message: string) => {
    errors.push(String(message))
  }) as typeof logger.error
  try {
    await run()
    await wait(500) // the broker's `basic.return` arrives right after the publish
  } finally {
    logger.error = original
  }
  return errors
}

Deno.test({
  ...options,
  name: 'enqueue(): a message for a queue that does not exist is reported, not silently dropped',
  fn: async () => {
    const provider = await registerProvider()
    const queue = `unroutable-test-${crypto.randomUUID().slice(0, 8)}`

    const errors = await captureErrors(async () => {
      await provider.enqueue(queue, { hello: 'world' }, { contextId: '' })
    })

    const returned = errors.filter((message) => message.includes('returned by the broker'))
    assertEquals(returned.length, 1, errors.join('\n'))
    assertEquals(returned[0].includes(queue), true, 'the routing key is in the message')
  },
})

Deno.test({
  ...options,
  name: 'enqueue(): a message for an existing queue is not reported',
  fn: async () => {
    const provider = await registerProvider()
    const queue = `routable-test-${crypto.randomUUID().slice(0, 8)}`
    const connection = await amqp.connect(URI)
    try {
      const channel = await connection.createChannel()
      await channel.assertQueue(queue, { durable: false, autoDelete: true })

      const errors = await captureErrors(async () => {
        await provider.enqueue(queue, { hello: 'world' }, { contextId: '' })
      })

      assertEquals(errors.filter((message) => message.includes('returned by the broker')), [])
      assertEquals((await channel.checkQueue(queue)).messageCount, 1)
    } finally {
      const cleanup = await connection.createChannel()
      cleanup.on('error', () => {})
      await cleanup.deleteQueue(queue).catch(() => {})
      await connection.close().catch(() => {})
    }
  },
})

Deno.test({
  ...options,
  name: 'schedule(): declares its own scheduler queue first, so nothing is returned',
  fn: async () => {
    const provider = await registerProvider()
    const queue = `scheduled-test-${crypto.randomUUID().slice(0, 8)}`
    const connection = await amqp.connect(URI)
    try {
      const errors = await captureErrors(async () => {
        await provider.schedule(queue, { hello: 'world' }, { delay: 600_000, contextId: '' })
      })

      assertEquals(errors.filter((message) => message.includes('returned by the broker')), [])
      const channel = await connection.createChannel()
      assertEquals((await channel.checkQueue(`${queue}.schq`)).messageCount, 1)
    } finally {
      const cleanup = await connection.createChannel()
      cleanup.on('error', () => {})
      await cleanup.deleteQueue(`${queue}.schq`).catch(() => {})
      await connection.close().catch(() => {})
    }
  },
})
