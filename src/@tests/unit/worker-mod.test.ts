import { assertEquals } from '@std/assert'
import { ZANIX_SERVER_MODULES } from '@zanix/server'
import {
  initWorkerEntrypoint,
  resolveSubscribersMetadataKey,
  resolveWorkerExecution,
  workerFileTypes,
} from 'modules/worker/mod.ts'
import { SUBSCRIBERS_METADATA_KEY } from 'utils/constants.ts'

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

Deno.test({
  name: 'resolveWorkerExecution: reflects a real `internal-process` value, not just main/extra',
  fn: () => {
    const original = Deno.env.get('ZANIX_WORKER_EXECUTION')
    try {
      Deno.env.set('ZANIX_WORKER_EXECUTION', 'internal-process')
      assertEquals(resolveWorkerExecution(), 'internal-process')
    } finally {
      if (original === undefined) Deno.env.delete('ZANIX_WORKER_EXECUTION')
      else Deno.env.set('ZANIX_WORKER_EXECUTION', original)
    }
  },
})

// Regression test for a real bug: `SUBSCRIBERS_METADATA_KEY` only has 2 keys (`Execution`'s
// `'main-process'`/`'extra-process'`), so indexing it directly with a `WorkerExecution` value of
// `'internal-process'` used to silently resolve to `undefined` — this is the fix's whole point.
Deno.test({
  name:
    'resolveSubscribersMetadataKey: `internal-process` resolves to the SAME bucket as `main-process`, not undefined',
  fn: () => {
    assertEquals(
      resolveSubscribersMetadataKey('internal-process'),
      SUBSCRIBERS_METADATA_KEY['main-process'],
    )
  },
})

Deno.test({
  name: 'resolveSubscribersMetadataKey: `main-process`/`extra-process` resolve to their own bucket',
  fn: () => {
    assertEquals(
      resolveSubscribersMetadataKey('main-process'),
      SUBSCRIBERS_METADATA_KEY['main-process'],
    )
    assertEquals(
      resolveSubscribersMetadataKey('extra-process'),
      SUBSCRIBERS_METADATA_KEY['extra-process'],
    )
  },
})
