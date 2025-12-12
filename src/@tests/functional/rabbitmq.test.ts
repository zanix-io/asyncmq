import { ZanixRabbitMQConnector } from 'modules/rabbitmq/connector.ts'
import { assertEquals } from '@std/assert'
import { Buffer } from 'node:buffer'

console.info = () => {}

Deno.test('RabbitMQ connector should send and receive a message', async () => {
  const connector = new ZanixRabbitMQConnector({ uri: 'amqp://guest:guest@localhost:5672/' })
  await connector.isReady
  const channel = await connector.createChannel()

  const queue = 'tasks'
  await channel.assertQueue(queue, {
    autoDelete: true,
  })

  setTimeout(() => {
    channel.sendToQueue(queue, Buffer.from('Hello from Deno!'))
  }, 500)

  await new Promise((resolve) => {
    channel.consume(queue, (msg) => {
      if (msg === null) return
      const body = msg.content.toString()
      assertEquals(body, 'Hello from Deno!')
      channel.ack(msg)

      resolve(true)
    })
  })

  await channel.close()
  await connector['close']()
})

Deno.test('RabbitMQ connector should consume all messages ', async () => {
  const connector = new ZanixRabbitMQConnector({ uri: 'amqp://guest:guest@localhost:5672/' })
  await connector.isReady
  const channel = await connector.createChannel()

  const queue = 'tasks-2'

  await channel.assertQueue(queue)

  channel.sendToQueue(queue, Buffer.from('Hello from Deno 1'))
  channel.sendToQueue(queue, Buffer.from('Hello from Deno 2'))

  await new Promise((resolve) => setTimeout(resolve, 500)) // wait until set

  const messages = await connector.consumeAllMessages(channel, queue)

  assertEquals(messages[0].content.toString(), 'Hello from Deno 1')
  assertEquals(messages[1].content.toString(), 'Hello from Deno 2')

  await channel.deleteQueue(queue)

  await channel.close()
  await connector['close']()
})
