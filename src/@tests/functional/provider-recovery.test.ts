// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from '@std/assert'
import { ZanixRabbitMQConnector } from 'modules/rabbitmq/connector.ts'
import { registerProvider, registerQueue } from './__setup__.ts'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Drops the TCP socket under amqplib, which is what the client sees on a broker restart, and
// checks the whole chain: connector reconnects, provider re-creates its publisher channel and the
// subscriber's consumer, and both consuming and publishing work again.
Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'ZanixRabbitMQ provider recovers its consumers and publisher after a connection drop',
  fn: async () => {
    const connections: any[] = []
    const proto = ZanixRabbitMQConnector.prototype as any
    const original = proto.openConnection
    proto.openConnection = async function (...args: unknown[]) {
      const connection = await original.apply(this, args)
      connections.push(connection)
      return connection
    }

    try {
      const queue = `recovery-queue-${crypto.randomUUID().slice(0, 8)}`
      const received: number[] = []
      const provider = await registerProvider()
      const send = () =>
        provider.enqueue(queue, { message: 'hello queue' }, { isInternal: true, contextId: '' })

      setTimeout(() => send().catch(() => {}), 200)
      await registerQueue(queue, { callback: () => received.push(Date.now()) })
      assertEquals(received.length, 1)

      const before = connections.length
      connections[before - 1].connection.stream.destroy(new Error('simulated broker restart'))

      // The publish issued during the outage must wait for recovery instead of failing.
      await wait(100)
      await send()
      await wait(2500)

      assert(connections.length > before, 'the connector opened a new connection')
      assertEquals(received.length, 2, 'the recovered consumer received the message')

      await send()
      await wait(500)
      assertEquals(received.length, 3, 'publishing keeps working after recovery')
    } finally {
      proto.openConnection = original
    }
  },
})
