import { assert } from '@std/assert'
import { Probe } from './__probe__.ts'

/**
 * Each execution of a cron schedules the next one BEFORE it runs, so a job slower than the cron's
 * period meets its own next execution while it is still running. That execution must be skipped,
 * and the chain must go on: dropping it would end the cron for good, and leaving it unacknowledged
 * would also hold the consumer's only prefetch slot, stopping the whole queue.
 */

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'cron: a job slower than its period skips the overlapped executions and keeps going',
  fn: async () => {
    const probe = await Probe.create()
    try {
      // Every 3 s, but each run takes 7 s: the executions at +3 s and +6 s overlap the first run.
      const worker = await probe.spawn('worker', { PROBE_JOB_MS: '7000' })
      await probe.spawn('server')

      await worker.until(() => worker.runs() >= 3, 60_000, 'the cron to run three times')

      const done = worker.lines.filter((line) => line.startsWith('PROBE_DONE')).length
      assert(done >= 2, `runs finish and the next ones start (finished ${done})`)
    } finally {
      await probe.cleanup()
    }
  },
})
