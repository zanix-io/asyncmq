// deno-lint-ignore-file no-explicit-any
import { processorHandler } from 'modules/subscribers/handler.ts'
import { MESSAGE_HEADERS, SCHEDULER_EXCHANGE } from 'utils/constants.ts'
import { assert, assertEquals } from '@std/assert'
import { encode } from 'modules/rabbitmq/provider/messages.ts'
import { ZanixCacheProvider } from '@zanix/server'

/**
 * What the handler does when a message's own lock is already held (`lockMessage`): the same
 * `messageId` is running, or was just released by a message being requeued.
 *
 * The consumer channel prefetches ONE message by default, and these queues consume with manual
 * acknowledgement, so a message that is neither acked nor requeued keeps that slot taken: the
 * channel receives nothing else until it closes. Every path out of the handler must therefore end
 * the delivery — and none of them may lose work that still has to happen (a retry, or the next
 * execution of a cron).
 */

type Calls = { log: string[]; ack: any[]; nack: any[]; send: any[]; publish: any[] }

const createChannel = (calls: Calls): any => ({
  ack: (msg: any) => {
    calls.log.push('ack')
    calls.ack.push(msg)
  },
  nack: (msg: any) => {
    calls.log.push('nack')
    calls.nack.push(msg)
  },
  sendToQueue: (queue: string, content: any, props: any) => {
    calls.log.push('sendToQueue')
    calls.send.push({ queue, content, props })
  },
  publish: (exchange: string, routingKey: string, content: any, props: any) => {
    calls.log.push('publish')
    calls.publish.push({ exchange, routingKey, content, props })
    return true
  },
})

/** A cache whose locks are held (`held`) or free, recording releases into `calls.log`. */
const createCache = (held: (key: string) => boolean, calls: Calls) =>
  new (class extends ZanixCacheProvider {
    public override use() {
      return {
        has: (key: string) => held(key),
        get: () => null,
        delete: () => {
          calls.log.push('unlock')
          return true
        },
        set: () => true,
      } as any
    }
  })()

const newCalls = (): Calls => ({ log: [], ack: [], nack: [], send: [], publish: [] })

class Job {
  // deno-lint-ignore deno-zanix-plugin/require-access-modifier
  static runs = 0
  // deno-lint-ignore deno-zanix-plugin/require-access-modifier
  context: any
  constructor(context: any) {
    this.context = context
  }
  public onmessage() {
    Job.runs++
  }
  public onerror() {}
}

const message = async (headers: Record<string, unknown>, messageId = 'job-1') => {
  const context = { id: 'ctx', payload: {}, locals: {} }
  return {
    content: await encode({ hello: 'world' }, 'secret'),
    properties: {
      messageId,
      headers: { [MESSAGE_HEADERS.context]: await encode(context, 'secret'), ...headers },
    },
  } as any
}

const CRON = ['probe-tick', {
  queue: 'zanix.worker.soft',
  schedule: '*/3 * * * * *',
  isActive: true,
  settings: {},
}] as any

Deno.test('lock held, plain duplicate: acknowledged and dropped, so the channel is not wedged', async () => {
  const calls = newCalls()
  const handler = processorHandler(Job as any, createChannel(calls), {
    queue: 'jobs',
    secret: 'secret',
    cache: createCache(() => true, calls),
  })
  Job.runs = 0

  await handler(await message({ 'x-attempt': 0 }))

  assertEquals(Job.runs, 0, 'the duplicate does not run')
  assertEquals(calls.ack.length, 1, 'but its delivery is ended')
  assertEquals(calls.nack.length, 0)
})

Deno.test('lock held, retry: kept for later instead of dropped', async () => {
  const calls = newCalls()
  const handler = processorHandler(Job as any, createChannel(calls), {
    queue: 'jobs',
    secret: 'secret',
    cache: createCache(() => true, calls),
  })
  Job.runs = 0

  await handler(await message({ 'x-attempt': 1 }))

  assertEquals(Job.runs, 0)
  assertEquals(calls.ack.length, 1, 'the delivery is ended')
  assertEquals(calls.send.length, 1, 'a copy goes back to the queue, after a delay')
  assertEquals(calls.send[0].queue.endsWith('.schq'), true)
  assert((calls.send[0].props.expiration ?? 0) > 0)
  assertEquals(calls.send[0].props.headers['x-attempt'], 1, 'it is still the same retry')
})

Deno.test('lock held, cron execution: skipped, but the NEXT execution is still scheduled', async () => {
  const calls = newCalls()
  const handler = processorHandler(Job as any, createChannel(calls), {
    queue: 'zanix.worker.soft',
    secret: 'secret',
    // The execution lock is held (the previous run is still going); the publish lock is free.
    cache: createCache((key) => !key.includes('publish:cron'), calls),
    crons: [CRON],
  })
  Job.runs = 0

  await handler(await message({ [MESSAGE_HEADERS.cronIdentifier]: 'probe-tick' }, 'probe-tick'))

  assertEquals(Job.runs, 0, 'an overlapping run is skipped')
  assertEquals(calls.publish.length, 1, 'the chain goes on: the next execution is scheduled')
  assertEquals(calls.publish[0].exchange, SCHEDULER_EXCHANGE)
  assertEquals(calls.publish[0].routingKey.endsWith('.cron.schq'), true)
  assertEquals(calls.ack.length, 1, 'and this delivery is ended')
})

Deno.test('retry: the lock is released BEFORE the retry is published, so it never meets it', async () => {
  const calls = newCalls()
  class Failing extends Job {
    public override onmessage() {
      throw new Error('boom')
    }
  }
  const handler = processorHandler(Failing as any, createChannel(calls), {
    queue: 'jobs',
    secret: 'secret',
    cache: createCache(() => false, calls),
    retries: { maxRetries: 2, backoffStrategy: () => 0 },
  })

  await handler(await message({ 'x-attempt': 0 }))

  const unlock = calls.log.lastIndexOf('unlock')
  const requeue = calls.log.indexOf('sendToQueue')
  assert(requeue >= 0, 'the retry is requeued')
  assert(unlock >= 0 && unlock < requeue, `unlock must come first, got: ${calls.log.join(' > ')}`)
})
