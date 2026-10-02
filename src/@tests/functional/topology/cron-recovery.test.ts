import { assert, assertEquals } from '@std/assert'
import { Probe, wait } from './__probe__.ts'

/**
 * A cron is a chain: each execution schedules the next one, and the chain lives in the broker. If a
 * link is lost the cron stops until something reschedules it. These tests break the chain on
 * purpose, and restart workers while it is healthy, with real processes against a real RabbitMQ.
 */

const options = { sanitizeOps: false, sanitizeResources: false }

Deno.test({
  ...options,
  name:
    'cron: a link lost while no worker had ever booted is repaired by the first worker that does',
  fn: async () => {
    const probe = await Probe.create()
    try {
      // The cron fires every 3 s, so while no worker exists its message expires and is
      // dead-lettered towards a queue nobody has declared: RabbitMQ drops it.
      const server = await probe.spawn('server')
      await wait(6000)
      assertEquals(await probe.messageCount(probe.queue('.cron.schq')), 0, 'the chain is broken')
      assertEquals(server.runs(), 0)

      const worker = await probe.spawn('worker')
      await worker.until(() => worker.runs() >= 2, 45_000, 'the repaired cron to run twice')
      assertEquals(worker.brokerErrors(), [])
    } finally {
      await probe.cleanup()
    }
  },
})

Deno.test({
  ...options,
  name: 'cron: a second worker booting while the chain is healthy does not add executions',
  fn: async () => {
    const probe = await Probe.create()
    try {
      const first = await probe.spawn('worker')
      await probe.spawn('server')
      await first.until(() => first.runs() >= 1, 15_000, 'the first run')

      const second = await probe.spawn('worker')
      const before = first.runs() + second.runs()
      const window = 12_000
      await wait(window)
      const ran = first.runs() + second.runs() - before

      assert(ran >= 2, `the cron kept running (ran ${ran})`)
      assert(ran <= window / 3000 + 1, `no extra chain was started (ran ${ran})`)
    } finally {
      await probe.cleanup()
    }
  },
})

Deno.test({
  ...options,
  name: 'cron: stopping and restarting the only worker keeps the cron going',
  fn: async () => {
    const probe = await Probe.create()
    try {
      const first = await probe.spawn('worker')
      await probe.spawn('server')
      await first.until(() => first.runs() >= 1, 15_000, 'the first run')
      await first.stop()

      const second = await probe.spawn('worker')
      await second.until(() => second.runs() >= 2, 25_000, 'the cron to keep running')
      assertEquals(second.brokerErrors(), [])
    } finally {
      await probe.cleanup()
    }
  },
})

Deno.test({
  ...options,
  name: 'declarations are idempotent across processes: no 406 whichever side declares first',
  fn: async () => {
    const probe = await Probe.create()
    try {
      const server = await probe.spawn('server') // declares the cron queue first
      await wait(1000)
      const worker = await probe.spawn('worker') // declares it again, with its own arguments
      await worker.until(() => worker.runs() >= 1, 25_000, 'a run')
      await probe.spawn('server') // and a second server declares it once more

      assertEquals(server.brokerErrors(), [])
      assertEquals(worker.brokerErrors(), [])
    } finally {
      await probe.cleanup()
    }
  },
})
