import { assert, assertEquals } from '@std/assert'
import { Probe, wait } from './__probe__.ts'

/**
 * Same boot-order hazard as `cron-boot-order.test.ts`, for the other things a process publishes
 * through the scheduler exchange, and for several processes booting at once.
 */

const options = { sanitizeOps: false, sanitizeResources: false }

/** Resolves when `check` holds, or rejects after `timeoutMs` naming what was awaited. */
async function until(check: () => Promise<boolean>, timeoutMs: number, what: string) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // deno-lint-ignore no-await-in-loop
    if (await check()) return
    // deno-lint-ignore no-await-in-loop
    await wait(100)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

Deno.test({
  ...options,
  name: 'schedule(): a plain scheduled message sent before any worker booted is kept, not dropped',
  fn: async () => {
    const probe = await Probe.create()
    try {
      const queue = 'probe-scheduled'
      const schq = probe.internalQueue(queue, '.schq')
      await probe.spawn('server', {
        PROBE_SCHEDULE_QUEUE: queue,
        PROBE_SCHEDULE_DELAY: '600000', // stays parked in the scheduler queue for the whole test
      })
      await wait(500)

      assertEquals(await probe.messageCount(schq), 1)
    } finally {
      await probe.cleanup()
    }
  },
})

Deno.test({
  ...options,
  name: 'cron: two servers booting together before any worker still run the cron once per tick',
  fn: async () => {
    const probe = await Probe.create()
    try {
      await Promise.all([probe.spawn('server'), probe.spawn('server')])
      // The servers scheduled the cron: its scheduler queue exists. Its message is not what is
      // looked at: it expires at the next tick (every 3 s) and, with no worker to dead-letter it
      // to, is dropped, so whether it is still there depends on where the tick falls.
      await until(
        async () => (await probe.messageCount(probe.queue('.cron.schq'))) !== null,
        10_000,
        'the cron to be scheduled',
      )

      const worker = await probe.spawn('worker')
      await worker.until(() => worker.runs() >= 1, 15_000, 'the first run')

      // After the first run, ticks are 3 s apart: duplicate messages must collapse into one chain.
      const before = worker.runs()
      const window = 12_000
      await wait(window)
      const ran = worker.runs() - before
      assert(ran >= 2, `the cron kept running (ran ${ran})`)
      assert(ran <= window / 3000 + 1, `no doubled executions (ran ${ran})`)
    } finally {
      await probe.cleanup()
    }
  },
})
