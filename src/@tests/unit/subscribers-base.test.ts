// deno-lint-ignore-file no-explicit-any
import type { ErrorInfo, MessageInfo } from 'typings/queues.ts'

import { assert, assertEquals } from '@std/assert'
import { stub } from '@std/testing/mock'
import { BaseRTO, IsString } from '@zanix/validator'
import { ApplicationError } from '@zanix/errors'
import { prepareContext } from 'utils/context.ts'
import { registerTask } from 'utils/tasks.ts'
import { Subscriber } from 'modules/subscribers/decorators/base.ts'
import { ZanixSubscriber } from 'modules/subscribers/base.ts'
import { IntensiveSubscriber } from 'modules/worker/queues/intensive.ts'
import { ModerateSubscriber } from 'modules/worker/queues/moderate.ts'
import { SoftSubscriber } from 'modules/worker/queues/soft.ts'

const fakeContext = () => prepareContext(() => ({ id: '', cookies: {}, locals: {} } as any)) as any

const fakeInfo = (context: any): MessageInfo => ({
  attempt: 0,
  queue: 'unit-test-queue',
  messageId: 'unit-test-message-id',
  context,
})

Deno.test({
  name: 'IntensiveSubscriber#onmessage: dispatches the message to the registered task',
  fn: async () => {
    let ran = false
    const taskId = registerTask('unit-intensive-task', () => {
      ran = true
    })
    const context = fakeContext()
    const subscriber = new IntensiveSubscriber(context)

    await subscriber.onmessage(
      { $args: undefined, $taskId: taskId } as any,
      fakeInfo(context),
    )

    assert(ran)
  },
})

Deno.test({
  name: 'ModerateSubscriber#onmessage: dispatches the message to the registered task',
  fn: async () => {
    let ran = false
    const taskId = registerTask('unit-moderate-task', () => {
      ran = true
    })
    const context = fakeContext()
    const subscriber = new ModerateSubscriber(context)

    await subscriber.onmessage(
      { $args: undefined, $taskId: taskId } as any,
      fakeInfo(context),
    )

    assert(ran)
  },
})

Deno.test('SoftSubscriber#onmessage: dispatches the message to the registered task', async () => {
  let ran = false
  const taskId = registerTask('unit-soft-task', () => {
    ran = true
  })
  const context = fakeContext()
  const subscriber = new SoftSubscriber(context)

  await subscriber.onmessage(
    { $args: undefined, $taskId: taskId } as any,
    fakeInfo(context),
  )

  assert(ran)
})

class UnitTestRto extends BaseRTO {
  @IsString({ expose: true })
  accessor message!: string
}

@Subscriber({ queue: 'unit-test-rto-route', rto: UnitTestRto })
class _RtoValidatedSubscriber extends ZanixSubscriber {
  public onmessage(_message: any, _info: MessageInfo) {}
}

Deno.test('ZanixSubscriber: wraps a failed RTO validation as an ApplicationError', async () => {
  const context = fakeContext()
  const subscriber = new _RtoValidatedSubscriber(context)

  let caught: unknown
  try {
    await (subscriber.onmessage(
      { message: 12345 },
      fakeInfo(context),
    ) as unknown as Promise<void>)
  } catch (error) {
    caught = error
  }

  assert(caught instanceof ApplicationError)
  assertEquals((caught as ApplicationError).message, 'Data validation Error')
})

@Subscriber('unit-test-onerror-route')
class _DefaultErrorSubscriber extends ZanixSubscriber {
  public onmessage(_message: any, _info: MessageInfo) {}
}

Deno.test('ZanixSubscriber#onerror: a non-terminal retry logs at warn level', () => {
  const warnLogs = stub(console, 'warn')
  const errorLogs = stub(console, 'error')
  try {
    const context = fakeContext()
    const subscriber = new _DefaultErrorSubscriber(context)
    const error = new Error('boom')
    const info: ErrorInfo = { ...fakeInfo(context), attempt: 1, requeued: true }
    ;(subscriber as any).onerror({ message: 'hello' }, error, info)

    assertEquals((error as any).meta.requeued, true)
    assertEquals(errorLogs.calls.length, 0)
    assertEquals(warnLogs.calls.length, 1)
    assertEquals(
      warnLogs.calls[0].args[1],
      'Retry 1 for the queue subscriber on topic "unit-test-queue" — message requeued, retries remaining',
    )
  } finally {
    warnLogs.restore()
    errorLogs.restore()
  }
})

Deno.test('ZanixSubscriber#onerror: the terminal attempt logs at error level', () => {
  const warnLogs = stub(console, 'warn')
  const errorLogs = stub(console, 'error')
  try {
    const context = fakeContext()
    const subscriber = new _DefaultErrorSubscriber(context)
    const error = new Error('boom')
    const info: ErrorInfo = { ...fakeInfo(context), attempt: 3, requeued: false }
    ;(subscriber as any).onerror({ message: 'hello' }, error, info)

    assertEquals((error as any).meta.requeued, false)
    assertEquals(warnLogs.calls.length, 0)
    assertEquals(errorLogs.calls.length, 1)
    assertEquals(
      errorLogs.calls[0].args[1],
      'Retries exhausted for the queue subscriber on topic "unit-test-queue" after attempt 3 — message sent to dead letters',
    )
  } finally {
    warnLogs.restore()
    errorLogs.restore()
  }
})
