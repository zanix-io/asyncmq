import { assertEquals, assertThrows } from '@std/assert'
import { stub } from '@std/testing/mock'
import { ProgramModule } from '@zanix/server'
import { registerDLQProcessor } from 'modules/jobs/dlq.defs.ts'
import { getTask } from 'utils/tasks.ts'
import { CRONS_METADATA_KEY } from 'utils/constants.ts'

console.error = () => {}

/** Same technique as the functional DLQ suite's `getRegisteredCronTask`, minus the real Mongo
 * connector — resolves the real, registered cron task via `@zanix/asyncmq`'s own task registry. */
const getRegisteredCronTask = (cronName: string) => {
  // deno-lint-ignore no-explicit-any
  const crons = ProgramModule.registry.get<[string, any][]>(CRONS_METADATA_KEY) || []
  const entry = crons.find(([name]) => name === cronName)
  if (!entry) throw new Error(`No cron job registered under "${cronName}"`)
  const [, jobDef] = entry
  return {
    task: getTask(jobDef.args.$taskId, jobDef.queue),
    args: jobDef.args.$args,
  }
}

Deno.test('registerDLQProcessor: throws when the underlying cron name is already taken', () => {
  try {
    registerDLQProcessor('dup.process', {
      name: 'dup-processor',
      schedule: '0,30 * * * * *',
      handler: () => {},
    })

    assertThrows(
      () =>
        registerDLQProcessor('dup.process', {
          name: 'dup-processor',
          schedule: '0,30 * * * * *',
          handler: () => {},
        }),
      Error,
      'Conflict: A Cron with the same name or identifier ("dlq:dup-processor") is already configured in the system.',
    )
  } finally {
    ProgramModule.registry.delete(CRONS_METADATA_KEY)
  }
})

Deno.test('registerDLQProcessor: logs a reprocessing failure before dlq.fail()', async () => {
  const errorLogs = stub(console, 'error')
  try {
    const calls: string[] = []
    const reprocessingError = new Error('reprocessing failed too')
    const fakeEntry = { _id: 'dlq-entry-id', payload: {} }
    const fakeDlq = {
      claim: () => {
        calls.push('claim')
        return fakeEntry
      },
      complete: () => {
        calls.push('complete')
      },
      fail: (id: string) => {
        calls.push('fail')
        // The failure must already have been logged by the time `fail()` runs.
        assertEquals(errorLogs.calls.length, 1)
        assertEquals(id, fakeEntry._id)
      },
    }

    registerDLQProcessor('unit-dlq-reprocess-fail.process', {
      name: 'unit-dlq-reprocess-fail',
      schedule: '0,30 * * * * *',
      handler: () => {
        throw reprocessingError
      },
    })

    const fakeThis = { providers: { get: () => fakeDlq } }
    const { task, args } = getRegisteredCronTask('dlq:unit-dlq-reprocess-fail')
    // deno-lint-ignore no-explicit-any
    await (task as any).call(fakeThis, args)

    assertEquals(calls, ['claim', 'fail'])
    assertEquals(errorLogs.calls.length, 1)
    assertEquals(
      errorLogs.calls[0].args[1],
      'DLQ reprocessing failed for entry "dlq-entry-id" (processType: "unit-dlq-reprocess-fail.process")',
    )
    // `logger.error` reformats the error before it reaches `console.error` — assert on the
    // parts that matter (name/message) rather than object identity/shape.
    assertEquals(
      (errorLogs.calls[0].args[2] as { message: string }).message,
      reprocessingError.message,
    )
  } finally {
    errorLogs.restore()
    ProgramModule.registry.delete(CRONS_METADATA_KEY)
  }
})
