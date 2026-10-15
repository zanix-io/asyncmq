import { registerCronJob } from 'modules/jobs/cron.defs.ts'
import { registerProvider, registerQueue } from '../__setup__.ts'
import { assertEquals } from '@std/assert'
import { ProgramModule } from '@zanix/server'
import { connect } from 'amqp'
import { cronqPath, qPath, schqPath } from 'modules/rabbitmq/provider/setup.ts'
import { CRONS_METADATA_KEY } from 'utils/constants.ts'
import { CRON_REPAIR_DELAY_MS } from 'modules/rabbitmq/provider/mod.ts'

const AMQP_URI = 'amqp://guest:guest@localhost:5672/'

/** The `messageId` of every message waiting in `queue`, read without consuming any of them. */
async function pendingMessageIds(queue: string): Promise<string[]> {
  const connection = await connect(AMQP_URI)
  const channel = await connection.createChannel()
  try {
    const { messageCount } = await channel.checkQueue(queue)
    const ids: string[] = []
    const messages = []
    for (let index = 0; index < messageCount; index++) {
      // deno-lint-ignore no-await-in-loop -- `get` answers one message at a time, in order
      const message = await channel.get(queue, { noAck: false })
      if (!message) break
      messages.push(message)
      ids.push(message.properties.messageId)
    }
    for (const message of messages) channel.nack(message, false, true)
    return ids.sort()
  } finally {
    await channel.close().catch(() => {})
    await connection.close().catch(() => {})
  }
}

async function deleteQueue(queue: string) {
  const connection = await connect(AMQP_URI)
  const channel = await connection.createChannel()
  await channel.deleteQueue(queue).catch(() => {})
  await channel.close().catch(() => {})
  await connection.close().catch(() => {})
}

function registerCrons(queue: string, names: string[]) {
  for (const name of names) {
    registerCronJob({
      name,
      isActive: true,
      args: { message: name },
      customQueue: queue,
      schedule: '0 0 0 1 1 *', // far enough that the message stays in the scheduler queue
    })
  }
}

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Booting a server keeps the next execution of every cron that shares a queue',
  fn: async () => {
    const queue = 'shared-cron-queue'
    const schedulerQueue = schqPath(cronqPath(qPath(queue)))
    const names = ['shared-cron-a', 'shared-cron-b', 'shared-cron-c']
    registerQueue(queue)
    try {
      registerCrons(queue, names)
      await registerProvider()
      await new Promise((resolve) => setTimeout(resolve, 1500))
      assertEquals(await pendingMessageIds(schedulerQueue), names)

      // A restart: the queue already holds the three executions the first boot scheduled.
      registerCrons(queue, names)
      await registerProvider()
      await new Promise((resolve) => setTimeout(resolve, 1500))
      assertEquals(await pendingMessageIds(schedulerQueue), names)
    } finally {
      ProgramModule.registry.delete(CRONS_METADATA_KEY)
      await deleteQueue(schedulerQueue)
    }
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Booting a server again keeps the next execution of a cron that has its queue alone',
  fn: async () => {
    const queue = 'solo-cron-queue'
    const schedulerQueue = schqPath(cronqPath(qPath(queue)))
    registerQueue(queue)
    try {
      registerCrons(queue, ['solo-cron'])
      await registerProvider()
      await new Promise((resolve) => setTimeout(resolve, 1500))
      assertEquals(await pendingMessageIds(schedulerQueue), ['solo-cron'])

      registerCrons(queue, ['solo-cron'])
      await registerProvider()
      await new Promise((resolve) => setTimeout(resolve, 1500))
      assertEquals(await pendingMessageIds(schedulerQueue), ['solo-cron'])
    } finally {
      ProgramModule.registry.delete(CRONS_METADATA_KEY)
      await deleteQueue(schedulerQueue)
    }
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    'A worker repairs the cron whose message is missing even when another cron of the queue has one',
  fn: async () => {
    const queue = 'repair-shared-cron-queue'
    const schedulerQueue = schqPath(cronqPath(qPath(queue)))
    registerQueue(queue)
    try {
      registerCrons(queue, ['repair-cron-a'])
      await registerProvider()
      await new Promise((resolve) => setTimeout(resolve, 1500))
      assertEquals(await pendingMessageIds(schedulerQueue), ['repair-cron-a'])

      // A worker that knows both crons finds the first one scheduled and the second one lost.
      Deno.env.set('ZANIX_WORKER_EXECUTION', 'extra-process')
      registerCrons(queue, ['repair-cron-a', 'repair-cron-b'])
      await registerProvider()
      await new Promise((resolve) => setTimeout(resolve, CRON_REPAIR_DELAY_MS + 2000))

      assertEquals(await pendingMessageIds(schedulerQueue), ['repair-cron-a', 'repair-cron-b'])
    } finally {
      Deno.env.delete('ZANIX_WORKER_EXECUTION')
      ProgramModule.registry.delete(CRONS_METADATA_KEY)
      await deleteQueue(schedulerQueue)
    }
  },
})
