import type { ProcessingQueues } from 'typings/queues.ts'
import type { Job } from 'typings/jobs.ts'
import type { CronJobDefinitionBase } from 'typings/crons.ts'
import type { DLQEntryAttrs } from '@zanix/database'

import { DLQProvider } from '@zanix/database'
import { registerCronJob } from './cron.defs.ts'

/**
 * Turns a caught `error` into the plain `{name, message, stack?}` shape `DLQProvider.fail()`
 * expects — a `catch` binding is typed `unknown`, and whatever gets thrown isn't guaranteed to be
 * a real `Error` instance.
 */
const toErrorInfo = (error: unknown): DLQEntryAttrs['error'] =>
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
      entry: DLQEntryAttrs,
    ) => Promise<unknown> | unknown
  }

/**
 * Registers how to reprocess `@zanix/datamaster` DLQ entries of a given `processType` — a thin
 * wrapper over `registerCronJob`: each tick, atomically claims one eligible entry for that
 * `processType` (if any — a no-op tick otherwise) via `DLQProvider.claim()`, runs `options.handler`,
 * and marks the entry `complete`/`fail` accordingly.
 *
 * `@zanix/datamaster`'s `DLQProvider` is a passive store — it never claims or interprets entries on
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
      const dlq = this.providers.get(DLQProvider)
      const leaseOwner = `dlq:${name}:${crypto.randomUUID()}`

      const entry = await dlq.claim({ leaseOwner, processType })
      if (!entry) return

      try {
        await handler.call(this, entry)
        await dlq.complete(entry._id, { leaseOwner })
      } catch (error) {
        await dlq.fail(entry._id, { leaseOwner, error: toErrorInfo(error) })
      }
    },
  })
}
