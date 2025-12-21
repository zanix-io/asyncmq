import { registerCronJob } from 'modules/jobs/cron.defs.ts'
import { registerProvider, registerQueue } from '../__setup__.ts'
import { assert, assertAlmostEquals, assertEquals } from '@std/assert'

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Crons Jobs should works with custom queues',
  fn: async () => {
    const queue = 'test-queue-cron'
    const register = registerQueue(queue)
    const start = Date.now()
    registerCronJob({
      name: 'my-cron',
      isActive: true,
      args: { message: 'hello queue' },
      customQueue: queue,
      schedule: '*/2 * * * * *',
      settings: {
        correlationId: 'id',
      },
    })
    setTimeout(() => {
      registerProvider()
    }, 100)

    const { calls } = await register
    assert(calls === 5 || calls === 6) // one call each 2 seconds

    assertAlmostEquals(Math.floor((Date.now() - start) / 1000), 10, 1)
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Crons should works with processing queues',
  fn: async () => {
    Deno.env.set('AMQP_URI', 'amqp://guest:guest@localhost:5672/')
    import('modules/worker/e-process.ts')

    await new Promise((resolve) => setTimeout(resolve, 3000))

    assertEquals(
      globalThis['cron-job-finish-response' as never],
      'hello cron soft queue (zanix.worker.soft)',
    )
  },
})
