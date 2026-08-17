import { assertEquals } from '@std/assert'

// `modules/rabbitmq/defs.ts` decides its connector `startMode` (`'lazy'` vs `'postBoot'`) and
// whether to register a connector/provider at all, purely from env vars read once at import time
// (module-level, memoized by Deno's module cache). By the time the rest of the suite first loads
// it, `ZANIX_WORKER_EXECUTION` is never `'internal-process'` and `AMQP_URI` is already set, so
// those two branches never get exercised there. A cache-busting query string forces a fresh module
// instantiation (still merged into this file's coverage) without touching the shared, real
// `AMQP_URI`-gated Connector/Provider decorators — `AMQP_URI` is unset for this import so it
// returns before those decorators ever run.
Deno.test({
  name:
    'modules/rabbitmq/defs.ts: skips connector/provider registration and picks the "lazy" internal-process startMode, both without AMQP_URI',
  fn: async () => {
    const originalExecution = Deno.env.get('ZANIX_WORKER_EXECUTION')
    const originalAmqpUri = Deno.env.get('AMQP_URI')
    try {
      Deno.env.set('ZANIX_WORKER_EXECUTION', 'internal-process')
      Deno.env.delete('AMQP_URI')

      const mod = await import(
        'modules/rabbitmq/defs.ts?probe=internal-process-no-amqp'
      )
      assertEquals(mod.default, undefined)
    } finally {
      if (originalExecution === undefined) {
        Deno.env.delete('ZANIX_WORKER_EXECUTION')
      } else Deno.env.set('ZANIX_WORKER_EXECUTION', originalExecution)
      if (originalAmqpUri === undefined) Deno.env.delete('AMQP_URI')
      else Deno.env.set('AMQP_URI', originalAmqpUri)
    }
  },
})
