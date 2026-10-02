import amqp from 'amqp'
import { assertEquals } from '@std/assert'
import { closeAllConnections, Interactor, ZanixInteractor } from '@zanix/server'
import { BaseRTO, IsString } from '@zanix/validator'
import { Subscriber } from 'modules/subscribers/decorators/base.ts'
import { ZanixSubscriber } from 'modules/subscribers/base.ts'
import { registerProvider } from './__setup__.ts'

/**
 * Two messages with the same `messageId` delivered at once (a publisher retrying, a cron message
 * duplicated by two schedulers) must run once, and the loser must be ACKNOWLEDGED: left
 * unacknowledged it would keep a prefetch slot taken, and the broker would hand it back every time
 * the connection closed.
 *
 * The check that it was acknowledged is made by closing the consumer's connection: anything still
 * unacknowledged goes back to the queue, so an empty queue afterwards means nothing was left behind.
 */

const URI = 'amqp://guest:guest@localhost:5672/'
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'a duplicate messageId runs once and leaves nothing unacknowledged',
  fn: async () => {
    const queue = `duplicate-test-${crypto.randomUUID().slice(0, 8)}`
    const ran: string[] = []

    @Interactor()
    class _Interactor extends ZanixInteractor {}
    class Rto extends BaseRTO {
      @IsString({ expose: true })
      accessor message!: string
    }
    @Subscriber({
      Interactor: _Interactor,
      rto: Rto,
      // Several slots on one channel, so both messages are delivered while the first still runs.
      queue: { topic: queue, settings: { channelPrefetch: 3 } },
    })
    class _Subscriber extends ZanixSubscriber<_Interactor> {
      public async onmessage(data: { message: string }) {
        ran.push(data.message)
        await wait(1500) // long enough for the duplicate to arrive meanwhile
      }
    }
    void _Subscriber

    const provider = await registerProvider()
    const send = (message: string, messageId: string) =>
      provider.enqueue(queue, { message }, { isInternal: true, contextId: '', messageId })

    await wait(500) // the consumer is attached
    await send('first', 'same-id')
    await send('duplicate', 'same-id')
    await wait(3500)
    assertEquals(ran, ['first'], 'only one of them ran')

    await closeAllConnections() // anything unacknowledged goes back to the queue now
    await wait(500)

    const connection = await amqp.connect(URI)
    try {
      const channel = await connection.createChannel()
      channel.on('error', () => {})
      assertEquals((await channel.checkQueue(`@zanix/asyncmq.${queue}`)).messageCount, 0)
    } finally {
      const cleanup = await connection.createChannel()
      cleanup.on('error', () => {})
      await Promise.all(
        ['', '.dlq', '.schq', '.cron.schq'].map((suffix) =>
          cleanup.deleteQueue(`@zanix/asyncmq.${queue}${suffix}`).catch(() => {})
        ),
      )
      await connection.close().catch(() => {})
    }
  },
})
