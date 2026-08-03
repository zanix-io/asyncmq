import { registerCronJob } from 'modules/jobs/cron.defs.ts'
import { registerProvider, registerQueue } from '../__setup__.ts'
import { assertEquals } from '@std/assert'
import { spy, stub } from '@std/testing/mock'
import { ProgramModule } from '@zanix/server'
import { ZanixCoreAsyncMQProvider } from 'modules/rabbitmq/provider/mod.ts'
import { CRONS_METADATA_KEY } from 'utils/constants.ts'

// Covers the `#executeCrons` branches that `cron-jobs.test.ts`'s real end-to-end cron doesn't hit:
// running as an extra-process worker, an inactive cron, a cron whose schedule never resolves a
// next date, and a cron registered without `args`. Each exercises the real constructor/broker path
// (the method is a true private class field, unreachable any other way) but only needs a single
// `#executeCrons` pass, so a spy on the public `schedule` override is enough to observe the branch
// taken instead of waiting on the full message round-trip these tests don't otherwise care about.

console.error = () => {}

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    'Cron execution skips scheduling and drops metadata when running as an extra-process worker',
  fn: async () => {
    const scheduleSpy = spy(ZanixCoreAsyncMQProvider.prototype, 'schedule')
    try {
      Deno.env.set('ZANIX_WORKER_EXECUTION', 'extra-process')

      registerCronJob({
        name: 'extra-process-cron',
        isActive: true,
        args: { message: 'hello' },
        customQueue: 'extra-process-cron-queue',
        schedule: '*/2 * * * * *',
      })

      await registerProvider()
      await new Promise((resolve) => setTimeout(resolve, 500))

      assertEquals(scheduleSpy.calls.length, 0)
      assertEquals(ProgramModule.registry.get(CRONS_METADATA_KEY), undefined)
    } finally {
      scheduleSpy.restore()
      Deno.env.delete('ZANIX_WORKER_EXECUTION')
      ProgramModule.registry.delete(CRONS_METADATA_KEY)
    }
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Cron execution skips scheduling an inactive cron',
  fn: async () => {
    const queue = 'inactive-cron-queue'
    const scheduleSpy = spy(ZanixCoreAsyncMQProvider.prototype, 'schedule')
    try {
      registerQueue(queue)
      registerCronJob({
        name: 'inactive-cron',
        isActive: false,
        args: { message: 'hello' },
        customQueue: queue,
        schedule: '*/2 * * * * *',
      })

      await registerProvider()
      await new Promise((resolve) => setTimeout(resolve, 1500))

      assertEquals(scheduleSpy.calls.length, 0)
    } finally {
      scheduleSpy.restore()
      ProgramModule.registry.delete(CRONS_METADATA_KEY)
    }
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Cron execution skips scheduling when the cron expression cannot resolve a next date',
  fn: async () => {
    const queue = 'invalid-schedule-cron-queue'
    const errorLogs = stub(console, 'error') // `nextCronDate` logs "Invalid cron expression"
    const scheduleSpy = spy(ZanixCoreAsyncMQProvider.prototype, 'schedule')
    try {
      registerQueue(queue)
      registerCronJob({
        name: 'invalid-schedule-cron',
        isActive: true,
        args: { message: 'hello' },
        customQueue: queue,
        schedule: '5-2 * * * * *', // descending range -> parses to an empty set of seconds
      })

      await registerProvider()
      await new Promise((resolve) => setTimeout(resolve, 1500))

      assertEquals(scheduleSpy.calls.length, 0)
    } finally {
      scheduleSpy.restore()
      errorLogs.restore()
      ProgramModule.registry.delete(CRONS_METADATA_KEY)
    }
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Cron execution schedules a null payload when no args were registered',
  fn: async () => {
    const queue = 'no-args-cron-queue'
    const scheduleSpy = spy(ZanixCoreAsyncMQProvider.prototype, 'schedule')
    try {
      registerQueue(queue)
      registerCronJob({
        name: 'no-args-cron',
        isActive: true,
        customQueue: queue,
        schedule: '*/2 * * * * *',
      })

      await registerProvider()
      await new Promise((resolve) => setTimeout(resolve, 1500))

      assertEquals(scheduleSpy.calls.length, 1)
      assertEquals(scheduleSpy.calls[0].args[1], null)
    } finally {
      scheduleSpy.restore()
      ProgramModule.registry.delete(CRONS_METADATA_KEY)
    }
  },
})
