// deno-lint-ignore-file no-explicit-any
import { type ReconnectOptions, ZanixRabbitMQConnector } from 'modules/rabbitmq/connector.ts'
import { assert, assertEquals, assertFalse } from '@std/assert'

console.info = () => {}
console.warn = () => {}
console.error = () => {}

type Fake = ReturnType<typeof fakeConnection>

const fakeConnection = () => {
  const handlers: Record<string, ((e?: unknown) => void)[]> = {}
  return {
    closed: false,
    on(event: string, cb: (e?: unknown) => void) {
      ;(handlers[event] ??= []).push(cb)
    },
    emit(event: string, e?: unknown) {
      handlers[event]?.forEach((cb) => cb(e))
    },
    close() {
      this.closed = true
      this.emit('close')
      return Promise.resolve()
    },
    createChannel: () => Promise.resolve({}),
    createConfirmChannel: () => Promise.resolve({}),
  }
}

/** Connector whose `openConnection` fails `failures` times, then hands out fake connections. */
class TestConnector extends ZanixRabbitMQConnector {
  public opened: Fake[] = []
  public attempts = 0
  public failures = 0
  constructor(reconnect: ReconnectOptions) {
    super({
      uri: 'amqp://fake',
      autoInitialize: false,
      reconnect: { initialDelayMs: 1, maxDelayMs: 5, ...reconnect },
    })
  }
  protected override openConnection(): Promise<any> {
    this.attempts++
    if (this.attempts > 1 && this.failures-- > 0) return Promise.reject(new Error('refused'))
    const connection = fakeConnection()
    this.opened.push(connection)
    return Promise.resolve(connection)
  }
  public start() {
    return this.initialize()
  }
  public stop() {
    return this.close()
  }
  public get last() {
    return this.opened[this.opened.length - 1]
  }
}

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms))

Deno.test('reconnect: retries with backoff until the broker is back, then runs the hooks', async () => {
  const connector = new TestConnector({ onExhausted: () => assert(false, 'must not exhaust') })
  connector.failures = 2
  await connector.start()
  let hooks = 0
  connector.onReconnect(() => {
    hooks++
  })

  connector.last.emit('close', new Error('broker restart'))
  assertFalse(connector.isHealthy())
  await connector.waitForConnection()
  await tick()

  assert(connector.isHealthy())
  assertEquals(hooks, 1)
  assertEquals(connector.attempts, 4) // initial + 2 failures + 1 success
})

Deno.test('reconnect: createChannel waits for the new connection instead of using the dead one', async () => {
  const connector = new TestConnector({})
  await connector.start()
  const dead = connector.last
  dead.emit('close')

  await connector.createChannel()
  assert(connector.last !== dead)
  assert(connector.isHealthy() || (await tick(), connector.isHealthy()))
})

Deno.test('reconnect: a hook may create channels while the reconnection is in progress (no deadlock)', async () => {
  const connector = new TestConnector({})
  await connector.start()
  let created = false
  connector.onReconnect(async () => {
    await connector.createChannel()
    created = true
  })
  connector.last.emit('close')
  await tick(100)
  assert(created)
  assert(connector.isHealthy())
})

Deno.test('reconnect: an intentional close() never reconnects', async () => {
  const connector = new TestConnector({ onExhausted: () => assert(false, 'must not exhaust') })
  await connector.start()
  await connector.stop()
  await tick()
  assertEquals(connector.attempts, 1)
  assertFalse(connector.isHealthy())
})

Deno.test('reconnect: calls onExhausted after maxAttempts failures', async () => {
  let exhausted = 0
  const connector = new TestConnector({ maxAttempts: 3, onExhausted: () => exhausted++ })
  await connector.start()
  connector.failures = 99
  connector.last.emit('close')
  await tick(200)
  assertEquals(exhausted, 1)
  assertEquals(connector.attempts, 4) // initial + 3 failed
  assertFalse(connector.isHealthy())
})

Deno.test('reconnect: enabled=false fails fast on the first loss', async () => {
  let exhausted = 0
  const connector = new TestConnector({ enabled: false, onExhausted: () => exhausted++ })
  await connector.start()
  connector.last.emit('close')
  await tick()
  assertEquals(exhausted, 1)
  assertEquals(connector.attempts, 1)
})

Deno.test('reconnect: a throwing hook discards the connection and retries', async () => {
  const connector = new TestConnector({ onExhausted: () => assert(false, 'must not exhaust') })
  await connector.start()
  let calls = 0
  connector.onReconnect(() => {
    if (++calls === 1) throw new Error('recovery failed')
  })
  connector.last.emit('close')
  await tick(100)
  assertEquals(calls, 2)
  assert(connector.isHealthy())
  assert(connector.opened[1].closed) // the half-recovered connection was dropped
})

Deno.test('connection `error` event is handled (no uncaught exception)', async () => {
  const connector = new TestConnector({})
  await connector.start()
  connector.last.emit('error', new Error('socket'))
  assert(connector.isHealthy())
})
