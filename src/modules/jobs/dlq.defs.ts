import type { ProcessingQueues } from 'typings/queues.ts'
import type { Job } from 'typings/jobs.ts'
import type { CronJobDefinitionBase } from 'typings/crons.ts'

// `@zanix/datamaster` publishes a genuinely narrow `./dlq` subpath — `DlqProvider`/
// `DlqEntryAttrs` and their supporting types, without that package's `cache` module
// (`redis`/`@redis/*`); it only reaches `mongoose`, since the DLQ collection is Mongo-backed. A
// plain, static, non-lazy import here is correct: this is a genuinely narrow subpath (`./dlq`)
// whose whole purpose is DLQ reprocessing via `@zanix/datamaster`, so a consumer who imports
// `@zanix/asyncmq/dlq` at all already wants this dependency, unconditionally. Distinct from
// `@zanix/datamaster/dlq-api`, which fronts its own local `/admin/dlq` HTTP surface, not
// `DlqProvider` itself — not something this package routes through instead.
//
// The `@zanix/datamaster/dlq` specifier resolves through the `@zanix/datamaster/dlq` alias
// declared in this package's own `deno.jsonc`, not as a literal string inline here — see that
// alias's own comment for the exact target it currently resolves to.
import { type DlqEntryAttrs, DlqProvider } from '@zanix/datamaster/dlq'
import { registerCronJob } from './cron.defs.ts'
import logger from '@zanix/logger'

/**
 * Turns a caught `error` into the plain `{name, message, stack?}` shape `DlqProvider.fail()`
 * expects — a `catch` binding is typed `unknown`, and whatever gets thrown isn't guaranteed to be
 * a real `Error` instance.
 */
const toErrorInfo = (error: unknown): DlqEntryAttrs['error'] =>
  error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: 'Error', message: String(error) }

/**
 * Everything needed to reprocess `@zanix/datamaster`'s DLQ entries of a given `processType` —
 * `schedule`/`isActive` are `registerCronJob`'s own `CronJobDefinitionBase` fields, `Pick`ed
 * directly rather than redeclared, so this type can never silently drift from the real cron
 * contract it's built on (unlike `@zanix/datamaster`'s registry-based design this replaced, which
 * had to keep `schedule` a plain `string` specifically to avoid depending on this package at all).
 */
export type DLQProcessorOptions =
  & Pick<CronJobDefinitionBase, 'schedule'>
  & Partial<Pick<CronJobDefinitionBase, 'isActive'>>
  & {
    /** Descriptive name — becomes part of the underlying cron job's own name (`dlq:<name>`). */
    name: string
    /** Processing-queue weight. Defaults to `'soft'`. */
    processingQueue?: ProcessingQueues
    /** The processor's reprocessing logic — called with the claimed DLQ entry. */
    handler: (
      this: ThisParameterType<Job>,
      entry: DlqEntryAttrs,
    ) => Promise<unknown> | unknown
  }

/**
 * Registers how to reprocess `@zanix/datamaster` DLQ entries of a given `processType` — a thin
 * wrapper over `registerCronJob`: each tick, atomically claims one eligible entry for that
 * `processType` (if any — a no-op tick otherwise) via `DlqProvider.claim()`, runs `options.handler`,
 * and marks the entry `complete`/`fail` accordingly.
 *
 * `@zanix/datamaster`'s `DlqProvider` is a passive store — it never claims or interprets entries on
 * its own; this is the mechanism that actually drives distributed reprocessing, direct and
 * synchronous (no separate registry/drain step, unlike `mail`/`request` trigger-action jobs — those
 * need one because a domain package can't reach `@zanix/asyncmq` directly without a lateral tier
 * dependency, but a DLQ processor is normally registered by the app's own code, which can always
 * reach `@zanix/asyncmq` directly).
 *
 * @throws `InternalError` if the underlying cron job name (`dlq:<name>`) is already registered —
 * same fail-fast semantics as `registerCronJob` itself.
 *
 * @example
 * ```ts
 * import { registerDLQProcessor } from '@zanix/asyncmq/dlq'
 *
 * registerDLQProcessor('payment.process', {
 *   name: 'reprocess-payment',
 *   schedule: '0,30 * * * * *', // every 30s
 *   handler: async function (entry) {
 *     const payments = this.providers.get(PaymentsRepository)
 *     await payments.retry(entry.payload)
 *   },
 * })
 * ```
 */
export const registerDLQProcessor = (
  processType: string,
  options: DLQProcessorOptions,
): void => {
  const { name, schedule, isActive, processingQueue, handler } = options

  registerCronJob({
    name: `dlq:${name}`,
    schedule,
    isActive: isActive ?? true,
    processingQueue: processingQueue ?? 'soft',
    handler: async function () {
      const dlq = this.providers.get(DlqProvider)
      const leaseOwner = `dlq:${name}:${crypto.randomUUID()}`

      const entry = await dlq.claim({ leaseOwner, processType })
      if (!entry) return

      try {
        await handler.call(this, entry)
        await dlq.complete(entry._id, { leaseOwner })
      } catch (error) {
        // `dlq.fail()` is a passive store write — it never logs on its own, so without this the
        // reprocessing failure is invisible to anything short of inspecting the DLQ entry directly.
        logger.error(
          `DLQ reprocessing failed for entry "${entry._id}" (processType: "${processType}")`,
          error,
        )
        await dlq.fail(entry._id, { leaseOwner, error: toErrorInfo(error) })
      }
    },
  })
}
