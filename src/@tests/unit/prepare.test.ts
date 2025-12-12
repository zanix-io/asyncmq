// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from '@std/assert'
import { decode, prepareOptions } from 'utils/messages.ts'
import { MESSAGE_HEADERS } from 'utils/constants.ts'
import { isUUID } from '@zanix/validator'

// Mock tipos mínimos
type ScopedContext = {
  id: string
  cookies: Record<string, unknown>
  locals: Record<string, unknown>
}

Deno.test('prepareOptions: usa el contexto cuando contextId existe', async () => {
  const getContext = (id: string): ScopedContext => ({
    id,
    cookies: { session: 'abc' },
    locals: { user: 123 },
  })

  const opts = await prepareOptions(
    {
      contextId: 'CTX-1',
      headers: { foo: 'bar' },
      retryConfig: { maxRetries: 3, backoffOptions: { delay: 100 } },
    },
    'secret',
    getContext as any,
  )

  const ctx = await decode(opts.headers[MESSAGE_HEADERS.context], 'secret')

  assertEquals(ctx.id, 'CTX-1')
  assertEquals(ctx.cookies.session, 'abc')
  assertEquals(ctx.locals.user, 123)
  assertEquals(opts.headers.foo, 'bar')

  assertEquals(opts.headers[MESSAGE_HEADERS.maxRetries], 3)
  assertEquals(opts.headers[MESSAGE_HEADERS.backoffOptions], {
    delay: 100,
  })
})

Deno.test('prepareOptions: genera UUID cuando no hay contextId', async () => {
  const getContext = () => {
    throw new Error('No debería llamarse')
  }

  const opts = await prepareOptions(
    {
      headers: {},
      retryConfig: {},
      contextId: undefined,
    },
    'secret',
    getContext,
  )

  const ctx = await decode(opts.headers['x-znx-context'], 'secret')

  // Usa fakeUUID
  assert(isUUID(ctx.id))
})

Deno.test('prepareOptions: asigna la prioridad correctamente cuando es string', async () => {
  const getContext = () =>
    ({
      id: 'CTX',
      cookies: {},
      locals: {},
    }) as any

  const opts = await prepareOptions(
    {
      priority: 'high',
      headers: {},
      retryConfig: {},
      contextId: undefined,
    },
    'secret',
    getContext,
  )

  assertEquals(opts.priority, 10)
})

Deno.test('prepareOptions: persistent tiene default true', async () => {
  const getContext = () => ({
    id: 'ctx',
    cookies: {},
    locals: {},
  })

  const opts = await prepareOptions(
    {
      headers: {},
      retryConfig: {},
      contextId: undefined,
    },
    'secret',
    getContext as any,
  )

  assertEquals(opts.persistent, true)
})
