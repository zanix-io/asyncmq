import { assertEquals } from '@std/assert'
import { ZANIX_SERVER_MODULES } from '@zanix/server'
import { initWorkerEntrypoint, workerFileTypes } from 'modules/worker/mod.ts'

Deno.test({
  name: 'workerFileTypes: returns every scanned module type outside an internal-process worker',
  fn: () => {
    const original = Deno.env.get('ZANIX_WORKER_EXECUTION')
    try {
      Deno.env.delete('ZANIX_WORKER_EXECUTION')
      assertEquals(workerFileTypes(), ZANIX_SERVER_MODULES)
    } finally {
      if (original === undefined) Deno.env.delete('ZANIX_WORKER_EXECUTION')
      else Deno.env.set('ZANIX_WORKER_EXECUTION', original)
    }
  },
})

Deno.test({
  name: 'workerFileTypes: excludes `.handler.ts` files inside an internal-process worker',
  fn: () => {
    const original = Deno.env.get('ZANIX_WORKER_EXECUTION')
    try {
      Deno.env.set('ZANIX_WORKER_EXECUTION', 'internal-process')
      assertEquals(
        workerFileTypes(),
        ZANIX_SERVER_MODULES.filter((type) => type !== '.handler.ts'),
      )
    } finally {
      if (original === undefined) Deno.env.delete('ZANIX_WORKER_EXECUTION')
      else Deno.env.set('ZANIX_WORKER_EXECUTION', original)
    }
  },
})

Deno.test({
  name:
    'initWorkerEntrypoint: awaits the caller-supplied loadDependencies before target initializations',
  fn: async () => {
    let loaded = false

    await initWorkerEntrypoint(() => {
      loaded = true
    })

    assertEquals(loaded, true)
  },
})
