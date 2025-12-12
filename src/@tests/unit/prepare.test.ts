// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from '@std/assert'
import { prepareOptions } from 'utils/messages.ts'
import { MESSAGE_HEADERS } from 'utils/constants.ts'
import { isUUID } from '@zanix/validator'

// Mock tipos mínimos
type ScopedContext = {
  id: string
  cookies: Record<string, unknown>
  locals: Record<string, unknown>
}

Deno.test('prepareOptions: usa el contexto cuando contextId existe', () => {
  const getContext = (id: string): ScopedContext => ({
    id,
    cookies: { session: 'abc' },
    locals: { user: 123 },
  })

  const opts = prepareOptions(
    {
      contextId: 'CTX-1',
      headers: { foo: 'bar' },
      retryConfig: { maxRetries: 3, backoffOptions: { delay: 100 } },
    },
    getContext as any,
  )

  const ctx = JSON.parse(opts.headers[MESSAGE_HEADERS.context])

  assertEquals(ctx.id, 'CTX-1')
  assertEquals(ctx.cookies.session, 'abc')
  assertEquals(ctx.locals.user, 123)
  assertEquals(opts.headers.foo, 'bar')

  assertEquals(opts.headers[MESSAGE_HEADERS.maxRetries], 3)
  assertEquals(opts.headers[MESSAGE_HEADERS.backoffOptions], {
    delay: 100,
  })
})

Deno.test('prepareOptions: genera UUID cuando no hay contextId', () => {
  const getContext = () => {
    throw new Error('No debería llamarse')
  }

  const opts = prepareOptions(
    {
      headers: {},
      retryConfig: {},
      contextId: undefined,
    },
    getContext,
  )

  const ctx = JSON.parse(opts.headers['x-znx-context'])

  // Usa fakeUUID
  assert(isUUID(ctx.id))
})

Deno.test('prepareOptions: asigna la prioridad correctamente cuando es string', () => {
  const getContext = () =>
    ({
      id: 'CTX',
      cookies: {},
      locals: {},
    }) as any

  const opts = prepareOptions(
    {
      priority: 'high',
      headers: {},
      retryConfig: {},
      contextId: undefined,
    },
    getContext,
  )

  assertEquals(opts.priority, 10)
})

Deno.test('prepareOptions: persistent tiene default true', () => {
  const getContext = () => ({
    id: 'ctx',
    cookies: {},
    locals: {},
  })

  const opts = prepareOptions(
    {
      headers: {},
      retryConfig: {},
      contextId: undefined,
    },
    getContext as any,
  )

  assertEquals(opts.persistent, true)
})
