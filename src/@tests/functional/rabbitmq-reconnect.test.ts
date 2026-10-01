// deno-lint-ignore-file no-explicit-any
import { Buffer } from 'node:buffer'
import { ZanixRabbitMQConnector } from 'modules/rabbitmq/connector.ts'
import { assert, assertEquals, assertFalse } from '@std/assert'

console.info = () => {}
console.warn = () => {}

class Connector extends ZanixRabbitMQConnector {
  public conn: any
  protected override async openConnection() {
    return this.conn = await super.openConnection()
  }
}

// Drops the TCP socket under amqplib: same effect the client sees as a broker restart.
Deno.test('reconnects after the socket is dropped and a consumer receives messages again', async () => {
  const connector = new Connector({
    uri: 'amqp://guest:guest@localhost:5672/',
    reconnect: { initialDelayMs: 400, maxDelayMs: 800, onExhausted: () => assert(false) },
  })
  await connector.isReady
  const queue = `reconnect-test-${crypto.randomUUID()}`
  const received: string[] = []

  const consume = async () => {
    const channel = await connector.createChannel()
    channel.on('error', () => {})
    await channel.assertQueue(queue, { autoDelete: true })
    await channel.consume(queue, (m: any) => {
      if (!m) return
      received.push(m.content.toString())
      channel.ack(m)
    })
  }
  await consume()
  connector.onReconnect(consume)

  connector.conn.connection.stream.destroy(new Error('simulated drop'))
  await new Promise((r) => setTimeout(r, 100))
  assertFalse(connector.isHealthy())

  await connector.waitForConnection()
  await new Promise((r) => setTimeout(r, 100))
  assert(connector.isHealthy())

  const publisher = await connector.createConfirmChannel()
  publisher.sendToQueue(queue, Buffer.from('after-drop'))
  await publisher.waitForConfirms()
  await new Promise((r) => setTimeout(r, 200))
  assertEquals(received, ['after-drop'])
  await connector['close']()
})
