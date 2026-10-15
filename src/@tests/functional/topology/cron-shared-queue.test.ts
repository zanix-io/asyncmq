import { assert, assertEquals } from '@std/assert'
import { Probe, wait } from './__probe__.ts'

/**
 * Crons that share a processing queue share its scheduler queue. A cron is a chain (each execution
 * schedules the next one and the chain lives in the broker), so what one cron does to that queue
 * must leave the others' links alone. Real processes against a real RabbitMQ.
 */

const options = { sanitizeOps: false, sanitizeResources: false }
const TWO_CRONS = { PROBE_SECOND_CRON: '1' }

/** The scheduled executions in `queue`, once the server has had time to schedule them (it does so
 * right after it announces it is ready) and to rewrite them after a restart. */
async function scheduledAfterBoot(probe: Awaited<ReturnType<typeof Probe.create>>) {
  await wait(3000)
  return await probe.messageCount(probe.queue('.cron.schq'))
}

Deno.test({
  ...options,
  name: 'cron: a server restart keeps the scheduled execution of every cron that shares a queue',
  fn: async () => {
    const probe = await Probe.create()
    try {
      // Every minute, so the executions stay scheduled while the test looks at the queue.
      const env = { ...TWO_CRONS, PROBE_SCHEDULE: '0 * * * * *' }
      const first = await probe.spawn('server', env)
      assertEquals(await scheduledAfterBoot(probe), 2, 'after the first boot')

      // The restart: the server finds both executions scheduled and rewrites them.
      await first.stop()
      await probe.spawn('server', env)
      assertEquals(await scheduledAfterBoot(probe), 2, 'after the restart')
    } finally {
      await probe.cleanup()
    }
  },
})

Deno.test({
  ...options,
  name:
    'cron: a worker repairs the cron whose link is lost while another cron of the queue is fine',
  fn: async () => {
    const probe = await Probe.create()
    try {
      // The server schedules the first cron alone (the second is not registered in it), so the
      // queue holds one message; the worker knows both crons and finds the second one missing.
      await probe.spawn('server')
      const worker = await probe.spawn('worker', TWO_CRONS)
      await worker.until(
        () => worker.count('PROBE_TOCK') >= 2,
        45_000,
        'the missing cron to be repaired and run twice',
      )
      assert(worker.runs() >= 1, 'the first cron kept running')
    } finally {
      await probe.cleanup()
    }
  },
})
