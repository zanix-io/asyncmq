import { assertEquals, assertThrows } from '@std/assert'
import { getTask, registerTask } from 'utils/tasks.ts'

console.error = () => {}

Deno.test('getTask: resolves a task registered under its taskId', () => {
  // deno-lint-ignore no-explicit-any
  const taskId = registerTask('sample-job', (() => 'ran') as any)

  // deno-lint-ignore no-explicit-any
  assertEquals((getTask(taskId, 'some-queue') as any)(), 'ran')
})

Deno.test('getTask: throws when the taskId was never registered', () => {
  assertThrows(
    () => getTask('missing.handler', 'some-queue'),
    Error,
    'Tasker not found on queue "some-queue"',
  )
})
