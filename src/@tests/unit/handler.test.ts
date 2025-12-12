// deno-lint-ignore-file no-explicit-any
// processorHandler.test.ts

import { assertEquals } from '@std/assert'
import { processorHandler } from 'utils/queues.ts'
import { MESSAGE_HEADERS } from 'utils/constants.ts'
import { encodeMessage } from 'utils/messages.ts'

// --- Mock Channel ---
const createMockChannel: any = () => {
  const ackCalls: any[] = []
  const nackCalls: any[] = []
  const sendCalls: any[] = []
  return {
    ackCalls: ackCalls,
    nackCalls: nackCalls,
    sendCalls: sendCalls,

    ack(msg: any) {
      this.ackCalls.push(msg)
    },
    nack(msg: any, requeue: boolean, multiple: boolean) {
      this.nackCalls.push({ msg, requeue, multiple })
    },
    sendToQueue(queue: string, content: any, props: any) {
      this.sendCalls.push({ queue, content, props })
    },
  }
}

// --- Mock Queue class ---
class MockQueue {
  // deno-lint-ignore deno-zanix-plugin/require-access-modifier
  context: any
  constructor(ctx: any) {
    this.context = ctx
  }

  public onmessage(_body: any, _opts: any) {}

  public onerror(_body: any, _err: any, _opts: any) {}
}

// --- Helper: create a message object ---
const createMsg = async (body: any, headers: Record<string, any> = {}) => ({
  content: await encodeMessage(body, 'secret'),
  properties: { headers },
})

// ########################################################
// # 1) SUCCESSFUL PROCESSING → ACK
// ########################################################

Deno.test('processorHandler: processes message successfully and ACKs', async () => {
  const channel = createMockChannel()

  const Queue = class extends MockQueue {
  }

  const handler = processorHandler(Queue, channel, {
    queue: 'jobs',
    secret: 'secret',
  })

  const context = { id: 'ctx1', payload: {}, locals: {} }

  const msg = await createMsg(
    { hello: 'world' },
    {
      [MESSAGE_HEADERS.context]: JSON.stringify(context),
      'x-attempt': 0,
    },
  )

  await handler(msg as any)

  assertEquals(channel.ackCalls.length, 1)
  assertEquals(channel.nackCalls.length, 0)
  assertEquals(channel.sendCalls.length, 0)
})

// ########################################################
// # 2) FAILURE → RETRY (attempt increments) → ACK original
// ########################################################

Deno.test(
  'processorHandler: retries when an error occurs and attempt < maxRetries',
  async () => {
    const channel = createMockChannel()

    const Queue = class extends MockQueue {
      public override onmessage() {
        throw new Error('fail')
      }
      // deno-lint-ignore deno-zanix-plugin/require-access-modifier
      onerrorCalls: any[] = []
      public override onerror(body: any, err: any, opts: any) {
        this.onerrorCalls.push({ body, err, opts })
      }
    }

    const handler = processorHandler(Queue, channel, {
      queue: 'jobs',
      secret: 'secret',
    })

    const msg = await createMsg(
      { hello: 'world' },
      {
        [MESSAGE_HEADERS.context]: JSON.stringify({ id: 'ctx', locals: {}, payload: {} }),
        [MESSAGE_HEADERS.maxRetries]: 3,
        'x-attempt': 0,
      },
    )

    await handler(msg as any)

    // Message should be requeued
    assertEquals(channel.sendCalls.length, 1)
    assertEquals(channel.sendCalls[0].props.headers['x-attempt'], 1)

    // Original message should be ACKed
    assertEquals(channel.ackCalls.length, 1)
  },
)

// ########################################################
// # 3) FAILURE WITH NO RETRIES LEFT → NACK
// ########################################################

Deno.test('processorHandler: NACKs when attempt >= maxRetries', async () => {
  const channel = createMockChannel()

  const Queue = class extends MockQueue {
    public override onmessage() {
      throw new Error('fail')
    }
  }

  const handler = processorHandler(Queue, channel, {
    queue: 'jobs',
    secret: 'secret',
  })

  const msg = await createMsg(
    { foo: 'bar' },
    {
      [MESSAGE_HEADERS.context]: JSON.stringify({ id: 'ctx2', payload: {}, locals: {} }),
      [MESSAGE_HEADERS.maxRetries]: 1,
      'x-attempt': 1,
    },
  )

  await handler(msg as any)

  assertEquals(channel.sendCalls.length, 0) // no retry
  assertEquals(channel.nackCalls.length, 1)
})

// ########################################################
// # 4) CUSTOM BACKOFF STRATEGY IS USED
// ########################################################

Deno.test('processorHandler: uses custom backoffStrategy from retryConfig', async () => {
  const channel = createMockChannel()

  let delayUsed = 0

  const handler = processorHandler(
    MockQueue,
    channel,
    {
      queue: 'jobs',
      secret: 'secret',
      retries: {
        maxRetries: 5,
        backoffStrategy: (attempt: number) => {
          delayUsed = attempt * 123
          return delayUsed
        },
      },
    },
  )

  const msg = await createMsg({ hi: 'there' }, {
    [MESSAGE_HEADERS.context]: JSON.stringify({ id: 'ctx3', payload: {}, locals: {} }),
    'x-attempt': 0,
  })

  // Force failure
  MockQueue.prototype.onmessage = () => {
    throw new Error('boom')
  }

  await handler(msg as any)

  assertEquals(delayUsed, 0 * 123)
  assertEquals(channel.sendCalls.length, 1)
})

// ########################################################
// # 5) GLOBAL maxRetries IS USED WHEN HEADER IS MISSING
// ########################################################

Deno.test(
  'processorHandler: uses global maxRetries when not present in message headers',
  async () => {
    const channel = createMockChannel()

    const handler = processorHandler(MockQueue, channel, {
      queue: 'jobs',
      secret: 'secret',
      retries: { maxRetries: 3 }, // global default
    })

    MockQueue.prototype.onmessage = () => {
      throw new Error('fail')
    }

    const msg = await createMsg({ test: 1 }, {
      [MESSAGE_HEADERS.context]: JSON.stringify({ id: 'ctx4', payload: {}, locals: {} }),
      'x-attempt': 0,
    })

    await handler(msg as any)

    assertEquals(channel.sendCalls.length, 1) // retried
  },
)
