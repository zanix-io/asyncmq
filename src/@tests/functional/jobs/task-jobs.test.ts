import type { ZanixCoreWorkerProvider } from 'modules/worker/provider.ts'

import { registerQueue, registerWorkerProvider } from '../__setup__.ts'
import { assert, assertEquals } from '@std/assert'
import { registerJob } from 'modules/jobs/task.defs.ts'
import { stub } from '@std/testing/mock'
import { ProgramModule } from '@zanix/server'

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Task Jobs should fail with custom queues',
  fn: async () => {
    const queue = 'test-queue-cron'
    registerQueue(queue)
    registerJob({
      name: 'my-task',
      args: { message: 'hello queue' },
      customQueue: queue,
    })

    const errosLogs = stub(console, 'error')
    const worker = await registerWorkerProvider()

    assert(!worker.runTask('my-task'))

    assertEquals(
      errosLogs.calls[0].args[1],
      "The job 'my-task' does not have a task handler configured",
    )

    assertEquals(
      errosLogs.calls[0].args[2].meta.suggestion,
      'You should provide the `handler` property when calling `registerJob`',
    )

    errosLogs.restore()
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Task Jobs should works',
  fn: async () => {
    Deno.env.set('AMQP_URI', 'amqp://guest:guest@localhost:5672/')
    await import('modules/worker/i-process.ts')

    const worker = ProgramModule.getProviders().get<ZanixCoreWorkerProvider>('worker')

    const response = await new Promise((resolve) => {
      assert(worker.runTask('my-moderate-task', {
        callback: (r) => {
          assertEquals(r.response.message, r.response.context.payload.body.message)
          assertEquals(r.response.context.queue, 'zanix.worker.moderate')
          resolve(r.response.message)
        },
      }))
    })

    assertEquals(response, 'hello local moderate queue')
  },
})
