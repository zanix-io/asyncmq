import { assertEquals, assertFalse } from '@std/assert'
import { stub } from '@std/testing/mock'
import { ProgramModule } from '@zanix/server'
import { ZanixCoreWorkerProvider } from 'modules/worker/provider.ts'
import { registerJob } from 'modules/jobs/task.defs.ts'
import { JOBS_METADATA_KEY, TASKER_URL_METADATA_KEY } from 'utils/constants.ts'

Deno.test({
  name: 'ZanixCoreWorkerProvider#runJob: returns false and logs when the job is not registered',
  fn: () => {
    const errorLogs = stub(console, 'error')
    try {
      const worker = new ZanixCoreWorkerProvider()

      assertFalse(worker.runJob('unregistered-job'))
      assertEquals(errorLogs.calls[0].args[1], "Job not found: 'unregistered-job'")
    } finally {
      errorLogs.restore()
    }
  },
})

Deno.test({
  name: 'ZanixCoreWorkerProvider#runTask: returns false and logs when the job is not registered',
  fn: () => {
    const errorLogs = stub(console, 'error')
    try {
      const worker = new ZanixCoreWorkerProvider()

      assertFalse(worker.runTask('unregistered-task'))
      assertEquals(errorLogs.calls[0].args[1], "Job not found: 'unregistered-task'")
    } finally {
      errorLogs.restore()
    }
  },
})

Deno.test({
  name:
    'ZanixCoreWorkerProvider#runTask: returns false when the job has no processingQueue-backed local queue',
  fn: () => {
    const errorLogs = stub(console, 'error')
    try {
      registerJob({
        name: 'no-processing-queue-task',
        customQueue: 'some-custom-queue',
        // deno-lint-ignore no-explicit-any
        handler: (() => {}) as any,
        args: {},
      })

      const worker = new ZanixCoreWorkerProvider()

      assertFalse(worker.runTask('no-processing-queue-task'))
      assertEquals(
        errorLogs.calls[0].args[1],
        "The job 'no-processing-queue-task' should not be executed using runTask, as it lacks a defined processingQueue.",
      )
    } finally {
      errorLogs.restore()
      ProgramModule.registry.delete(JOBS_METADATA_KEY)
    }
  },
})

Deno.test({
  name: 'ZanixCoreWorkerProvider#runTask: returns false when no tasker URL has been registered',
  fn: () => {
    const errorLogs = stub(console, 'error')
    try {
      ProgramModule.registry.delete(TASKER_URL_METADATA_KEY)

      registerJob({
        name: 'no-tasker-url-task',
        processingQueue: 'soft',
        handler: (() => {}) as unknown as never,
        args: {},
      })

      const worker = new ZanixCoreWorkerProvider()

      assertFalse(worker.runTask('no-tasker-url-task'))
      assertEquals(
        errorLogs.calls[0].args[1],
        'Task execution is not available: no internal worker tasker URL has been registered.',
      )
    } finally {
      errorLogs.restore()
      ProgramModule.registry.delete(JOBS_METADATA_KEY)
    }
  },
})

Deno.test({
  name:
    'ZanixCoreWorkerProvider#runTask: falls back to null args when the job has neither `args` nor `handler`',
  fn: () => {
    const errorLogs = stub(console, 'error')
    try {
      registerJob({ name: 'no-args-task', customQueue: 'some-custom-queue' })

      const worker = new ZanixCoreWorkerProvider()

      assertFalse(worker.runTask('no-args-task'))
      assertEquals(
        errorLogs.calls[0].args[1],
        "The job 'no-args-task' does not have a task handler configured",
      )
    } finally {
      errorLogs.restore()
      ProgramModule.registry.delete(JOBS_METADATA_KEY)
    }
  },
})

Deno.test({
  name: 'ZanixCoreWorkerProvider: defaults #jobs to {} when nothing was registered in the registry',
  fn: () => {
    const errorLogs = stub(console, 'error')
    try {
      ProgramModule.registry.delete(JOBS_METADATA_KEY)

      const worker = new ZanixCoreWorkerProvider()

      assertFalse(worker.runJob('anything'))
    } finally {
      errorLogs.restore()
    }
  },
})
