// deno-lint-ignore-file no-explicit-any
import { assertEquals } from '@std/assert'
import { ProgramModule } from '@zanix/server'
import { DLQProvider, registerDLQModel, ZanixMongoConnector } from '@zanix/database'
import { registerDLQProcessor } from 'modules/jobs/dlq.defs.ts'
import { getTask } from 'utils/tasks.ts'
import { CRONS_METADATA_KEY } from 'utils/constants.ts'

console.error = () => {}

/** A real Mongo connector, constructed directly (bypassing full `@zanix/server` DI/bootstrap) —
 * same technique `@zanix/datamaster`'s own test suite uses for its functional tests. */
class TestMongo extends ZanixMongoConnector {
  constructor() {
    super({ seedModel: false, triggersModel: false })
  }
}
TestMongo.prototype['_znx_props_'] = {
  ...TestMongo.prototype['_znx_props_'],
  startMode: 'onBoot',
}

/** Retrieves the real, registered cron job's underlying task handler — the exact function
 * `registerDLQProcessor` passed to `registerCronJob`, resolved the same way an actual cron tick
 * would (via `@zanix/asyncmq`'s own task registry), not a re-implementation of it. */
const getRegisteredCronTask = (cronName: string) => {
  const crons = ProgramModule.registry.get<[string, any][]>(CRONS_METADATA_KEY) || []
  const entry = crons.find(([name]) => name === cronName)
  if (!entry) throw new Error(`No cron job registered under "${cronName}"`)
  const [, jobDef] = entry
  return {
    task: getTask(jobDef.args.$taskId, jobDef.queue),
    args: jobDef.args.$args,
  }
}

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    'registerDLQProcessor: a real cron tick claims a real Mongo DLQ entry, runs the handler, and completes it',
  fn: async () => {
    registerDLQModel()
    const db = new TestMongo()
    await db.isReady

    const dlq: any = Object.create(DLQProvider.prototype)
    Object.defineProperty(dlq, 'database', { value: db })

    try {
      const pushed = await dlq.push({
        processType: 'asyncmq-dlq-integration.process',
        origin: 'test',
        payload: { orderId: 'abc123' },
        error: { name: 'Error', message: 'boom' },
      })

      const received: unknown[] = []
      registerDLQProcessor('asyncmq-dlq-integration.process', {
        name: 'asyncmq-dlq-integration',
        schedule: '0,30 * * * * *',
        handler: (entry) => {
          received.push(entry)
        },
      })

      // `this.providers` only ever needs to resolve `DLQProvider` for this handler — a minimal
      // stand-in for `@zanix/server`'s real DI container, same as `registerDLQProcessor`'s own
      // `this.providers.get(DLQProvider)` call expects, bound to our real-Mongo-backed instance.
      const fakeThis = { providers: { get: () => dlq } }
      const { task, args } = getRegisteredCronTask(
        'dlq:asyncmq-dlq-integration',
      )
      await (task as any).call(fakeThis, args)

      assertEquals(received.length, 1)
      assertEquals((received[0] as any).payload, { orderId: 'abc123' })
      assertEquals((received[0] as any)._id, pushed._id)

      const fetched = await dlq.get(pushed._id)
      assertEquals(fetched.status, 'completed')
    } finally {
      const Model = db.getModel('zanix-dlq')
      await Model.deleteMany({})
      ProgramModule.registry.delete(CRONS_METADATA_KEY)
      await db['close']()
    }
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'registerDLQProcessor: a handler that throws fails the entry instead of completing it',
  fn: async () => {
    registerDLQModel()
    const db = new TestMongo()
    await db.isReady

    const dlq: any = Object.create(DLQProvider.prototype)
    Object.defineProperty(dlq, 'database', { value: db })

    try {
      const pushed = await dlq.push({
        processType: 'asyncmq-dlq-integration-fail.process',
        origin: 'test',
        payload: {},
        error: { name: 'Error', message: 'boom' },
        maxAttempts: 3,
      })

      registerDLQProcessor('asyncmq-dlq-integration-fail.process', {
        name: 'asyncmq-dlq-integration-fail',
        schedule: '0,30 * * * * *',
        handler: () => {
          throw new Error('reprocessing failed too')
        },
      })

      const fakeThis = { providers: { get: () => dlq } }
      const { task, args } = getRegisteredCronTask(
        'dlq:asyncmq-dlq-integration-fail',
      )
      await (task as any).call(fakeThis, args)

      const fetched = await dlq.get(pushed._id)
      assertEquals(fetched.status, 'pending') // attempts (1) < maxAttempts (3)
      assertEquals(fetched.error.message, 'reprocessing failed too')
    } finally {
      const Model = db.getModel('zanix-dlq')
      await Model.deleteMany({})
      ProgramModule.registry.delete(CRONS_METADATA_KEY)
      await db['close']()
    }
  },
})

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'registerDLQProcessor: a tick with nothing eligible never invokes the handler',
  fn: async () => {
    registerDLQModel()
    const db = new TestMongo()
    await db.isReady

    const dlq: any = Object.create(DLQProvider.prototype)
    Object.defineProperty(dlq, 'database', { value: db })

    try {
      let calls = 0
      registerDLQProcessor('asyncmq-dlq-integration-empty.process', {
        name: 'asyncmq-dlq-integration-empty',
        schedule: '0,30 * * * * *',
        handler: () => {
          calls++
        },
      })

      const fakeThis = { providers: { get: () => dlq } }
      const { task, args } = getRegisteredCronTask(
        'dlq:asyncmq-dlq-integration-empty',
      )
      await (task as any).call(fakeThis, args)

      assertEquals(calls, 0)
    } finally {
      ProgramModule.registry.delete(CRONS_METADATA_KEY)
      await db['close']()
    }
  },
})
