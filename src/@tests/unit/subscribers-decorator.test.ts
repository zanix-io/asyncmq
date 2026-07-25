import { assertEquals, assertThrows } from '@std/assert'
import { ProgramModule } from '@zanix/server'
import { Subscriber } from 'modules/subscribers/decorators/base.ts'
import { ZanixSubscriber } from 'modules/subscribers/base.ts'
import { SUBSCRIBERS_METADATA_KEY } from 'utils/constants.ts'
import type { SubscriberMetadata } from 'typings/queues.ts'

console.error = () => {}

const mainProcessSubscribers = () =>
  ProgramModule.registry.get<SubscriberMetadata[]>(SUBSCRIBERS_METADATA_KEY['main-process']) || []

Deno.test('Subscriber: registers a route using the bare-string shorthand', () => {
  @Subscriber('unit-test-string-route')
  class _StringRouteSubscriber extends ZanixSubscriber {
    public onmessage() {}
  }

  const registered = mainProcessSubscribers().find(([route]) => route === 'unit-test-string-route')

  assertEquals(registered?.[0], 'unit-test-string-route')
})

Deno.test({
  name: 'Subscriber: registers a route using `queue` as a bare string inside the options object',
  fn: () => {
    @Subscriber({ queue: 'unit-test-queue-string-route' })
    class _QueueStringRouteSubscriber extends ZanixSubscriber {
      public onmessage() {}
    }

    const registered = mainProcessSubscribers().find(
      ([route]) => route === 'unit-test-queue-string-route',
    )

    assertEquals(registered?.[0], 'unit-test-queue-string-route')
  },
})

Deno.test('Subscriber: throws when the route is already registered', () => {
  @Subscriber('unit-test-duplicate-route')
  class _FirstSubscriber extends ZanixSubscriber {
    public onmessage() {}
  }

  assertThrows(
    () => {
      @Subscriber('unit-test-duplicate-route')
      class _SecondSubscriber extends ZanixSubscriber {
        public onmessage() {}
      }
      return _SecondSubscriber
    },
    Error,
    'Conflict: A Queue with the same path or name ("unit-test-duplicate-route") is already configured in the system.',
  )
})

Deno.test('Subscriber: throws when the decorated class does not extend ZanixSubscriber', () => {
  class _NotASubscriber {}

  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => Subscriber('unit-test-invalid-class-route')(_NotASubscriber as any),
    Error,
    'is not a valid Subscriber. Please extend ZanixSubscriber',
  )
})
