import { registerQueue, registerWorkerProvider } from '../__setup__.ts'
import { assert } from '@std/assert'
import { registerJob } from 'modules/jobs/task.defs.ts'
import { dirname, join } from 'node:path'

const childSpawn = () => {
  const file = join(dirname(import.meta.url), '../../../modules/worker/e-process.ts')

  const command = new Deno.Command('deno', {
    args: ['run', '-A', file],
    env: {
      AMQP_URI: 'amqp://guest:guest@localhost:5672/',
    },
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
  })

  return command.spawn()
}

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
    const child = childSpawn()
    await import('./job.defs.ts')
    const worker = await registerWorkerProvider()

    assert(worker.runJob('my-intensive-job'))

    let hasMessage = false
    // deno-lint-ignore no-non-null-assertion
    for await (const chunk of child.stdout!) {
      const message = new TextDecoder().decode(chunk)

      hasMessage =
        message === 'job-finish-response: hello local intensive queue (zanix.worker.intensive)'
    }

    assert(hasMessage)
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'Amqp Jobs should works with custom queues in extra process',
  fn: async () => {
    const child = childSpawn()
    await import('./job.defs.ts')
    const worker = await registerWorkerProvider()

    await worker.runJob('my-custom-job')

    let hasMessage = false

    // deno-lint-ignore no-non-null-assertion
    for await (const chunk of child.stdout!) {
      const message = new TextDecoder().decode(chunk)

      hasMessage = message === 'external-job-finish-response: hello local custom queue'
    }

    assert(hasMessage)
  },
})
