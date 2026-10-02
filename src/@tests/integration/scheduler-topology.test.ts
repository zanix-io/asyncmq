import amqp from 'amqp'
import { Buffer } from 'node:buffer'
import { assert, assertEquals, assertRejects } from '@std/assert'
import { SCHEDULER_EXCHANGE } from 'utils/constants.ts'
import { declareSchedulerQueue, ensureSchedulerTopology } from 'modules/rabbitmq/provider/setup.ts'

/**
 * `ensureSchedulerTopology` / `declareSchedulerQueue` against a real RabbitMQ: what a publisher
 * declares before it schedules a message, so the scheduler exchange has a route for it.
 *
 * Every queue name is unique to the test and deleted afterwards; the shared scheduler exchange is
 * only ever asserted (it is durable and has the same arguments everywhere), never deleted.
 */

const URI = Deno.env.get('AMQP_URI') || 'amqp://guest:guest@localhost:5672/'

const options = { sanitizeOps: false, sanitizeResources: false }
const unique = () => `topology-test-${crypto.randomUUID().slice(0, 8)}`

/** Runs `run` with a channel and a unique queue name, deleting what it created afterwards. */
async function withQueue(run: (channel: amqp.Channel, queue: string) => Promise<void>) {
  const connection = await amqp.connect(URI)
  const queue = `${unique()}.schq`
  try {
    const channel = await connection.createChannel()
    channel.on('error', () => {})
    await run(channel, queue)
  } finally {
    const cleanup = await connection.createChannel()
    cleanup.on('error', () => {})
    await cleanup.deleteQueue(queue).catch(() => {})
    await cleanup.deleteQueue(`${queue}.target`).catch(() => {})
    await connection.close().catch(() => {})
  }
}

Deno.test({
  ...options,
  name: 'ensureSchedulerTopology: a message published under the queue name is routed to it',
  fn: () =>
    withQueue(async (channel, queue) => {
      await ensureSchedulerTopology(channel, queue, `${queue}.target`)

      const publisher = await amqp.connect(URI)
      const confirm = await publisher.createConfirmChannel()
      const returned: unknown[] = []
      confirm.on('return', (message: unknown) => returned.push(message))
      await new Promise<void>((resolve, reject) =>
        confirm.publish(
          SCHEDULER_EXCHANGE,
          queue,
          Buffer.from('x'),
          { mandatory: true, expiration: 600_000 },
          (error) => error ? reject(error) : resolve(),
        )
      )

      await publisher.close()
      assertEquals(returned.length, 0, 'the broker found a route')
      assertEquals((await channel.checkQueue(queue)).messageCount, 1)
    }),
})

Deno.test({
  ...options,
  name: 'ensureSchedulerTopology: without it the same publish is unroutable (what it fixes)',
  fn: async () => {
    const connection = await amqp.connect(URI)
    const queue = `${unique()}.schq`
    try {
      const channel = await connection.createConfirmChannel()
      const returned: unknown[] = []
      channel.on('return', (message: unknown) => returned.push(message))
      await channel.assertExchange(SCHEDULER_EXCHANGE, 'direct', { durable: true })
      await new Promise<void>((resolve, reject) =>
        channel.publish(
          SCHEDULER_EXCHANGE,
          queue,
          Buffer.from('x'),
          { mandatory: true },
          (error) => error ? reject(error) : resolve(),
        )
      )
      assertEquals(returned.length, 1, 'nothing is bound to this routing key')
    } finally {
      await connection.close().catch(() => {})
    }
  },
})

Deno.test({
  ...options,
  name: 'ensureSchedulerTopology: declaring twice, or after another declarer, changes nothing',
  fn: () =>
    withQueue(async (channel, queue) => {
      await ensureSchedulerTopology(channel, queue, `${queue}.target`)
      await ensureSchedulerTopology(channel, queue, `${queue}.target`)
      // `setup()` declares through the same helper, without the exchange.
      await declareSchedulerQueue(channel, queue, `${queue}.target`)

      assertEquals((await channel.checkQueue(queue)).messageCount, 0)
    }),
})

Deno.test({
  ...options,
  name:
    'declareSchedulerQueue: different arguments are rejected by the broker (why they must match)',
  fn: () =>
    withQueue(async (channel, queue) => {
      await declareSchedulerQueue(channel, queue, `${queue}.target`)

      // A second declaration with another dead-letter target is a 406 PRECONDITION-FAILED, which
      // also closes that channel: so the arguments the server and the worker use must be identical.
      const second = await amqp.connect(URI)
      try {
        const other = await second.createChannel()
        other.on('error', () => {})
        const error = await assertRejects(() =>
          declareSchedulerQueue(other, queue, 'another.target')
        )
        assert(String((error as Error).message).includes('406'), String(error))
      } finally {
        await second.close().catch(() => {})
      }
    }),
})
