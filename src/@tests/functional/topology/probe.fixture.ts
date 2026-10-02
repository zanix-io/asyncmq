// deno-coverage-ignore-file
import {
  attachGlobalErrorHandlers,
  closeAllConnections,
  targetInitializations,
} from '@zanix/server'
import { initWorkerEntrypoint, registerExtraProcessQueues } from 'modules/worker/mod.ts'
import { ZanixCoreAsyncMQProvider } from 'modules/rabbitmq/provider/mod.ts'

/**
 * Test-only process, spawned by `__probe__.ts` with its own throwaway project (`cwd` holds a
 * `deno.json` naming it), so every queue it declares is namespaced to that project. Two roles:
 *
 * - `server`: what `Zanix.start()` does for the pieces that matter here — registers the RabbitMQ
 *   connector and provider, loads the project's cron definitions, and boots the provider, which
 *   schedules the crons. It runs no worker, so a `soft` cron is only scheduled, never executed.
 * - `worker`: what `Zanix.startWorker()` does — `registerExtraProcessQueues` + `initWorkerEntrypoint`,
 *   which declares the queues and bindings and consumes the `soft` queue.
 *
 * Prints `PROBE_READY` once booted; the cron handler (`probe-jobs.ts`) prints `PROBE_RUN`.
 */
attachGlobalErrorHandlers(self)
self.addEventListener('unload', async () => {
  await closeAllConnections()
})

const role = Deno.env.get('PROBE_ROLE')
const announce = (line: string) => Deno.stdout.write(new TextEncoder().encode(line + '\n'))

if (role === 'worker') {
  await import('modules/core.ts')
  await registerExtraProcessQueues()
  await initWorkerEntrypoint(async () => {
    await import('./probe-jobs.ts')
    await import('@zanix/datamaster/core')
  })
} else if (role === 'server') {
  await import('@zanix/datamaster/core')
  await import('modules/rabbitmq/defs.ts')
  await import('./probe-jobs.ts')
  await targetInitializations('onSetup')
  await targetInitializations('onBoot')
  const provider = new ZanixCoreAsyncMQProvider()
  // A plain scheduled message (not a cron), published by the server: `PROBE_SCHEDULE_QUEUE` names
  // the (internal) queue and `PROBE_SCHEDULE_DELAY` how long it waits, in ms.
  const scheduleQueue = Deno.env.get('PROBE_SCHEDULE_QUEUE')
  if (scheduleQueue) {
    await provider.schedule(scheduleQueue, { probe: true }, {
      isInternal: true,
      delay: Number(Deno.env.get('PROBE_SCHEDULE_DELAY') || 60_000),
      contextId: '',
    })
    await announce('PROBE_SCHEDULED')
  }
} else {
  throw new Error(`PROBE_ROLE must be 'server' or 'worker', got '${role}'`)
}

await announce('PROBE_READY')

await new Promise<void>((resolve) => {
  const shutdown = async () => {
    Deno.removeSignalListener('SIGINT', shutdown)
    Deno.removeSignalListener('SIGTERM', shutdown)
    await closeAllConnections()
    resolve()
    Deno.exit(0)
  }
  Deno.addSignalListener('SIGINT', shutdown)
  Deno.addSignalListener('SIGTERM', shutdown)
})
