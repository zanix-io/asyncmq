import { childSpawn, killChild, registerQueue, registerWorkerProvider } from '../__setup__.ts'
import { assert } from '@std/assert'
import { ProgramModule } from '@zanix/server'
import { registerJob } from 'modules/jobs/task.defs.ts'

Deno.test.afterAll(() => {
  ProgramModule.registry.resetContainer()
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Amqp Jobs should works with custom queues',
  fn: async () => {
    const queue = 'test-queue-job'
    const register = registerQueue(queue)
    registerJob({
      name: 'my-job',
      args: { message: 'hello queue' },
      customQueue: queue,
    })

    const worker = await registerWorkerProvider()
    worker.runJob('my-job')

    await register
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Amqp Jobs should works with processing queues',
  fn: async () => {
    Deno.env.set('AMQP_URI', 'amqp://guest:guest@localhost:5672/')
    const child = childSpawn('my-intensive-job')
    await import('./job.defs.ts')
    const worker = await registerWorkerProvider()

    assert(worker.runJob('my-intensive-job'))

    let hasMessage = false
    // deno-lint-ignore no-non-null-assertion
    for await (const chunk of child.stdout!) {
      const message = new TextDecoder().decode(chunk)

      hasMessage =
        message === 'job-finish-response: hello local intensive queue (zanix.worker.intensive)'

      if (hasMessage) break
    }

    await killChild(child)
    assert(hasMessage)
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Amqp Jobs should works with custom queues in extra process',
  fn: async () => {
    Deno.env.set('AMQP_URI', 'amqp://guest:guest@localhost:5672/')
    const child = childSpawn('my-custom-job')
    await import('./job.defs.ts')
    const worker = await registerWorkerProvider()

    await worker.runJob('my-custom-job')

    let hasMessage = false

    // deno-lint-ignore no-non-null-assertion
    for await (const chunk of child.stdout!) {
      const message = new TextDecoder().decode(chunk)

      hasMessage = message === 'external-job-finish-response: hello local custom queue'

      if (hasMessage) break
    }

    await killChild(child)
    assert(hasMessage)
  },
})
