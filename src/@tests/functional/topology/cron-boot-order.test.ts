import { assert, assertEquals } from '@std/assert'
import { Probe, wait } from './__probe__.ts'

/**
 * A cron is a message with a TTL: the process that boots the project (`Zanix.start()`, the
 * "server") publishes it to the scheduler exchange, and a worker (`Zanix.startWorker()`) consumes
 * it once it expires. These tests boot real processes against a real RabbitMQ, in each order, and
 * check the cron actually runs and keeps running.
 *
 * Why the order matters: the exchange only delivers what a binding routes, and the bindings were
 * created by the worker alone. A server that scheduled its cron before any worker had ever run
 * published into an exchange with no binding for it, which RabbitMQ drops without an error.
 */

const options = { sanitizeOps: false, sanitizeResources: false }

/** Two runs prove the chain continues (each run schedules the next); one proves only the first. */
const CHAIN = 2
const PER_RUN_MS = 12_000

Deno.test({
  ...options,
  name:
    'cron: a server that boots BEFORE any worker leaves its cron waiting in the queue, not dropped',
  fn: async () => {
    const probe = await Probe.create()
    try {
      // Every minute, so the pending message cannot expire while the test looks at it.
      const server = await probe.spawn('server', { PROBE_SCHEDULE: '0 * * * * *' })
      await wait(1500) // `#executeCrons` runs right after boot

      assertEquals(await probe.messageCount(probe.queue('.cron.schq')), 1)
      assertEquals(server.runs(), 0, 'the server never executes a `soft` cron')
      assertEquals(server.brokerErrors(), [])
    } finally {
      await probe.cleanup()
    }
  },
})

Deno.test({
  ...options,
  name: 'cron: a server that boots BEFORE any worker still gets its cron executed',
  fn: async () => {
    const probe = await Probe.create()
    try {
      const server = await probe.spawn('server')
      await wait(1500)

      const worker = await probe.spawn('worker')
      await worker.until(() => worker.runs() >= CHAIN, PER_RUN_MS * CHAIN, 'the cron to run twice')
      assertEquals(server.runs(), 0, 'the server never executes a `soft` cron')
    } finally {
      await probe.cleanup()
    }
  },
})

Deno.test({
  ...options,
  name:
    'cron: a worker that boots BEFORE the server gets the cron executed (the order that always worked)',
  fn: async () => {
    const probe = await Probe.create()
    try {
      const worker = await probe.spawn('worker')
      await probe.spawn('server')
      await worker.until(() => worker.runs() >= CHAIN, PER_RUN_MS * CHAIN, 'the cron to run twice')
    } finally {
      await probe.cleanup()
    }
  },
})

Deno.test({
  ...options,
  name: 'cron: restarting the server while a worker runs does not double the cron',
  fn: async () => {
    const probe = await Probe.create()
    try {
      const worker = await probe.spawn('worker')
      const first = await probe.spawn('server')
      await worker.until(() => worker.runs() >= 1, PER_RUN_MS, 'the first run')

      await first.stop()
      await probe.spawn('server') // reboot: drains and re-publishes the pending cron message

      // Over the next ticks the job runs about once per tick (every 3 s), never twice per tick.
      const before = worker.runs()
      const window = 12_000
      await wait(window)
      const ran = worker.runs() - before
      assert(ran >= 2, `the cron kept running after the restart (ran ${ran})`)
      assert(ran <= window / 3000 + 1, `no doubled executions after the restart (ran ${ran})`)
    } finally {
      await probe.cleanup()
    }
  },
})
