Deno.env.set('ZANIX_WORKER_EXECUTION', 'extra-process')

import { attachGlobalErrorHandlers, closeAllConnections } from '@zanix/server'
import logger from '@zanix/logger'

attachGlobalErrorHandlers(self)

/** Disconnect all current connectors */
self.addEventListener('unload', async () => {
  await closeAllConnections()
})

// AsyncMQ queues for extra-process
import './queues/intensive.ts'
import './queues/moderate.ts'
import './queues/soft.ts'

// Imports the process configuration file, awaiting its load before continuing
// The `await` is necessary to ensure the Deno environment configuration is fully loaded before execution
await import('./dependencies.ts')

logger.success('External worker initialized...')

// Preserve instance
await new Promise<void>((resolve) => {
  Deno.addSignalListener('SIGINT', () => {
    logger.info('Closing external worker...', 'noSave')

    resolve()
    Deno.exit(0)
  })
})
