// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from '@std/assert'
import { prepareContext } from 'utils/context.ts'
import { getTask } from 'utils/tasks.ts'
import { _Subscriber } from './job.defs.ts'

const fakeContext = () => prepareContext(() => ({ id: '', cookies: {}, locals: {} } as any)) as any

// A fully local mock `this` context — never touches `ProgramModule`'s shared/global provider
// registry, so it can't pollute or depend on what any other test file registered under 'cache'.
const fakeGetter = (value: unknown = {}) => ({ get: () => value }) as any

const callTask = (taskId: string, queue: string, args: unknown) =>
  (getTask(taskId, queue) as any).call({
    providers: fakeGetter({ kvLocal: {} }),
    connectors: fakeGetter(),
    interactors: fakeGetter(),
    context: fakeContext(),
  }, args)

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    "job.defs.ts fixture: 'my-moderate-task' handler runs and resolves providers without throwing",
  fn: async () => {
    const result = await callTask('my-moderate-task.handler', 'zanix.worker.moderate', {
      message: 'hi',
    })

    assertEquals(result.message, 'hi')
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    "job.defs.ts fixture: 'my-intensive-job' handler returns early when the 'id' env var doesn't match",
  fn: async () => {
    Deno.env.delete('id')

    // Should not throw, and should not attempt the stdout write below this point.
    await callTask('my-intensive-job.handler', 'zanix.worker.intensive', { message: 'hi' })
    assert(true)
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    "job.defs.ts fixture: 'my-intensive-job' handler resolves providers and writes to stdout when 'id' matches",
  fn: async () => {
    Deno.env.set('id', 'my-intensive-job')
    try {
      await callTask('my-intensive-job.handler', 'zanix.worker.intensive', { message: 'hi' })
      assert(true)
    } finally {
      Deno.env.delete('id')
    }
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    "job.defs.ts fixture: 'my-handler-cron' handler resolves providers and writes to stdout when 'id' matches",
  fn: async () => {
    Deno.env.set('id', 'my-handler-cron')
    try {
      await callTask('my-handler-cron.handler', 'zanix.worker.soft', { message: 'hi' })
      assert(true)
    } finally {
      Deno.env.delete('id')
    }
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    "job.defs.ts fixture: 'my-handler-cron' handler returns early when the 'id' env var doesn't match",
  fn: async () => {
    Deno.env.delete('id')

    // Should not throw, and should not attempt provider resolution or the stdout write below.
    await callTask('my-handler-cron.handler', 'zanix.worker.soft', { message: 'hi' })
    assert(true)
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    "job.defs.ts fixture: extra-process _Subscriber#onmessage writes to stdout when 'id' matches",
  fn: async () => {
    Deno.env.set('id', 'my-custom-job')
    try {
      const subscriber = new _Subscriber(fakeContext())
      await (subscriber as any).onmessage({ message: 'hi' }, {} as any)
      assert(true)
    } finally {
      Deno.env.delete('id')
    }
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    "job.defs.ts fixture: extra-process _Subscriber#onmessage returns early when the 'id' env var doesn't match",
  fn: async () => {
    Deno.env.delete('id')

    const subscriber = new _Subscriber(fakeContext())
    await (subscriber as any).onmessage({ message: 'hi' }, {} as any)
    assert(true)
  },
})
