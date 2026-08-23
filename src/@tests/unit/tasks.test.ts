import { assertEquals, assertThrows } from '@std/assert'
import { InternalError } from '@zanix/errors'
import { getTask, registerTask } from 'utils/tasks.ts'

console.error = () => {}

Deno.test('getTask: resolves a task registered under its taskId', () => {
  // deno-lint-ignore no-explicit-any
  const taskId = registerTask('sample-job', (() => 'ran') as any)

  // deno-lint-ignore no-explicit-any
  assertEquals((getTask(taskId, 'some-queue') as any)(), 'ran')
})

Deno.test('getTask: throws when the taskId was never registered', () => {
  const error = assertThrows(
    () => getTask('missing.handler', 'some-queue'),
    InternalError,
    'Tasker not found on queue "some-queue"',
  )
  assertEquals(error.code, 'ASYNCMQ_WORKER_TASK_NOT_FOUND')
})
