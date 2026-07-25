import {
  cleanupInitializationsMetadata,
  ProgramModule,
  targetInitializations,
  ZANIX_SERVER_MODULES,
} from '@zanix/server'
import { SUBSCRIBERS_METADATA_KEY, TASKER_URL_METADATA_KEY } from 'utils/constants.ts'

export { processor as baseProcessor } from './queues/base.ts'
export type { ProcessorOptions } from 'typings/worker.ts'
export type { FullProcessingQueue, ProcessingQueues } from 'typings/queues.ts'

/**
 * Whether the current process is an internal worker thread
 * (`ZANIX_WORKER_EXECUTION === 'internal-process'`), as opposed to a standalone extra process.
 *
 * A function, not a top-level constant — the env var only gets set once something actually calls
 * {@link registerExtraProcessQueues} (extra-process) or the module registered via
 * {@link setTaskerUrl} runs (internal-process), both of which happen well after this module is
 * first imported, so reading it fresh on each call is what makes this reflect the real, current
 * mode instead of a stale value from import time.
 */
const isInternalProcess = (): boolean =>
  Deno.env.get('ZANIX_WORKER_EXECUTION') === 'internal-process'

/**
 * The project-file types that should be scanned for the current process type: excludes
 * `.handler.ts` files when running as an internal worker thread (avoids registering
 * subscribers/handlers a second time in that thread), includes everything otherwise (so a
 * standalone extra-process worker can still accept external subscribers).
 */
export const workerFileTypes = (): typeof ZANIX_SERVER_MODULES =>
  isInternalProcess()
    /* avoid all subscribers and handlers */
    ? ZANIX_SERVER_MODULES.filter((type) => type !== '.handler.ts')
    /* accept handlers to allow external subscribers */
    : ZANIX_SERVER_MODULES

/**
 * Marks the current process as AsyncMQ's internal worker thread
 * (`ZANIX_WORKER_EXECUTION=internal-process` — the same env var, and value, `isInternalProcess`/
 * `workerFileTypes` read). Callers (e.g. `@zanix/core`'s own internal-process bootstrap module,
 * registered via {@link setTaskerUrl}) shouldn't need to know the literal string themselves —
 * calling this is enough to declare that role.
 */
export function registerInternalProcess(): void {
  Deno.env.set('ZANIX_WORKER_EXECUTION', 'internal-process')
}

/**
 * Shared target-initialization lifecycle for a worker-execution-mode entrypoint — either the
 * internal-process worker-thread entrypoint (the file registered via {@link setTaskerUrl}) or a
 * standalone extra-process worker (e.g. `@zanix/core`'s `startWorker`). Callers mark their own
 * execution mode first — {@link registerInternalProcess} or {@link registerExtraProcessQueues} —
 * since that part differs between the two; this helper only covers what both share:
 *
 * ```ts
 * // my-internal-process.ts
 * import { baseProcessor, initWorkerEntrypoint, registerInternalProcess } from '@zanix/asyncmq/worker'
 *
 * registerInternalProcess()
 * await initWorkerEntrypoint(async () => {
 *   // ...register/scan this project's own jobs, providers, connectors here...
 * })
 *
 * export const processor = baseProcessor
 * ```
 *
 * It runs, in order:
 * 1. `loadDependencies` (if given) — this is where the caller's own jobs/handlers/providers must
 *    be registered/scanned. It runs before any target-initialization phase deliberately: whatever
 *    it registers still needs to exist before the matching `startMode` phase below runs, or that
 *    phase will never see it — regardless of whether it's `onSetup`, `onBoot`, or `postBoot`.
 * 2. The `onSetup`, `onBoot`, and `postBoot` target-initialization phases, so the
 *    providers/connectors a task/job handler pulls via `this.providers`/`this.connectors` (through
 *    `baseProcessor`) are actually instantiated in this thread/process's own isolated module
 *    registry — without this, resolving one fails with `INVALID_INSTANCE` the first time a
 *    task/job runs.
 * 3. {@link cleanupSubscribersMetadata} and `@zanix/server`'s `cleanupInitializationsMetadata`, to
 *    drop metadata that's no longer needed once initialization is done.
 *
 * @param loadDependencies - Optional project-specific registration/scan step, run before any
 * target-initialization phase. Omit it when the caller only needs the lifecycle boilerplate (e.g.
 * registering a single job by hand afterwards, since job registration itself isn't `startMode`-bound).
 */
export async function initWorkerEntrypoint(
  loadDependencies?: () => Promise<void> | void,
): Promise<void> {
  await loadDependencies?.()
  await targetInitializations('onSetup')
  await targetInitializations('onBoot')
  await targetInitializations('postBoot')
  cleanupSubscribersMetadata(isInternalProcess())
  cleanupInitializationsMetadata()
}

/**
 * Registers the internal-process worker-thread bootstrap module — the file a spawned Worker
 * thread runs as its entrypoint when `ZanixCoreWorkerProvider.runTask` dispatches a job locally
 * (the no-AMQP fallback). AsyncMQ ships no built-in one: since that thread has its own isolated
 * module registry (function references can't cross a `postMessage` boundary), whoever owns the
 * app's job/handler registrations (e.g. `@zanix/core`) is responsible for providing this module
 * and calling `setTaskerUrl` once, early in its own bootstrap — before any `runTask` dispatch can
 * happen. Without it, `runTask` logs an error and returns `false`.
 *
 * @param url - Absolute `file://` URL of the bootstrap module (e.g. via `import.meta.resolve`).
 */
export function setTaskerUrl(url: string): void {
  ProgramModule.registry.set(TASKER_URL_METADATA_KEY, url)
}

/**
 * Marks the current process as a standalone AsyncMQ worker (`ZANIX_WORKER_EXECUTION=extra-process`
 * — the same env var, and value, `isInternalProcess`/`workerFileTypes` read) and registers the
 * extra-process queue subscribers (`intensive`, `moderate`, `soft`) it needs, as opposed to queues
 * processed within the main process or an internal worker thread.
 *
 * `ZANIX_WORKER_EXECUTION`'s exact values are AsyncMQ's own contract (also read by its RabbitMQ
 * provider/defs) — callers (e.g. `@zanix/core`'s `Zanix.startWorker()`) shouldn't need to know the
 * literal string themselves; calling this is enough to declare that role. Callers are responsible
 * for the rest of the process bootstrap.
 */
export async function registerExtraProcessQueues(): Promise<void> {
  Deno.env.set('ZANIX_WORKER_EXECUTION', 'extra-process')

  await import('./queues/intensive.ts')
  await import('./queues/moderate.ts')
  await import('./queues/soft.ts')
}

/**
 * Clears subscriber metadata that's no longer needed once subscribers have finished registering —
 * always clears the main-process key; additionally clears the extra-process key when running
 * inside an internal worker thread (`isInternal`), since that thread never needs it.
 *
 * @param isInternal - Whether the current process is an internal worker thread — see
 * {@link isInternalProcess}.
 */
export function cleanupSubscribersMetadata(isInternal: boolean): void {
  ProgramModule.registry.delete(SUBSCRIBERS_METADATA_KEY['main-process'])
  if (isInternal) {
    ProgramModule.registry.delete(SUBSCRIBERS_METADATA_KEY['extra-process'])
  }
}
