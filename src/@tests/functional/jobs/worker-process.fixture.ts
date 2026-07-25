import { attachGlobalErrorHandlers, closeAllConnections } from '@zanix/server'
import { initWorkerEntrypoint, registerExtraProcessQueues } from 'modules/worker/mod.ts'
import logger from '@zanix/logger'

import 'modules/core.ts'

// Test-only fixture spawned as a real child process (see `__setup__.ts`'s `childSpawn`) to
// exercise a standalone AsyncMQ worker end-to-end. Mirrors the relevant parts of `@zanix/core`'s
// `Zanix.startWorker()` — minus any cross-package (datamaster/notifications) setup, which this
// suite doesn't need — plus this test tree's own job/cron/subscriber definitions.

attachGlobalErrorHandlers(self)

self.addEventListener('unload', async () => {
  await closeAllConnections()
})

await registerExtraProcessQueues()
await initWorkerEntrypoint(async () => {
  await import('./job.defs.ts')
  await import('jsr:@zanix/datamaster@0.5.*/core')
})

logger.success('External worker initialized...')

await new Promise<void>((resolve) => {
  Deno.addSignalListener('SIGINT', async () => {
    logger.info('Closing external worker...', 'noSave')
    await closeAllConnections()
    resolve()
    Deno.exit(0)
  })
})
