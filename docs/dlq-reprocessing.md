# Dead Letter Queue Reprocessing

`@zanix/asyncmq/dlq` reprocesses `@zanix/datamaster`'s Dead Letter Queue (`DLQProvider`) entries —
items that failed in some business process (payments, webhooks, jobs, ...) and were persisted for
auditing/debugging/retry. This is a **separate subpath**, so importing the rest of `@zanix/asyncmq`
never pulls in `@zanix/datamaster`'s module graph for apps that don't use this feature.

`DLQProvider` itself is a **passive store** — it never claims or interprets entries on its own.
`registerDLQProcessor` is the mechanism that actually drives reprocessing: a thin wrapper over
`registerCronJob`, direct and synchronous. See `@zanix/datamaster`'s **`docs/DLQ.md`** for
`DLQProvider`'s own lifecycle (`push`/`get`/`list`/`claim`/...), `registerDLQModel`, and payload
protection — this doc only covers the reprocessing bridge that lives here.

This is distinct from RabbitMQ's own broker-native dead-letter mechanism
(`ZanixAsyncMQProvider.requeueDeadLetters`) — that one reroutes messages the broker itself moved
after exhausting delivery retries. `DLQProvider` is a persisted, broker-agnostic registry of
business-level failures, useful even in apps that never touch a message queue at all.

---

## 1. Basic usage

```ts
import { registerDLQProcessor } from '@zanix/asyncmq/dlq'

registerDLQProcessor('payment.process', {
  name: 'reprocess-payment',
  schedule: '0,30 * * * * *', // every 30s
  handler: async function (entry) {
    const payments = this.providers.get(PaymentsRepository)
    await payments.retry(entry.payload)
  },
})
```

`processType` (the first argument) selects which `DLQProvider` entries this processor is responsible
for — the same value passed to `DLQProvider.push({ processType })` on the producing side. Register
one `registerDLQProcessor` call per `processType` that needs reprocessing.

## 2. What happens on every tick

Registering a processor is really registering a cron job (named `dlq:<name>` internally) whose
handler, each tick:

1. Atomically claims one eligible entry for `processType` via `DLQProvider.claim()` — a no-op tick
   if nothing is eligible (`handler` is never called).
2. Runs your `handler`, passed the claimed entry.
3. On success, calls `DLQProvider.complete()`.
4. On a thrown error (sync or async), calls `DLQProvider.fail()` with the error's `name`/`message`/
   `stack` — `DLQProvider` itself decides whether that moves the entry back to `'pending'` (attempts
   remain) or to a terminal `'failed'` state (`maxAttempts` reached).

No manual claim/lease/complete/fail bookkeeping is required in `handler` — all of it is handled by
the wrapper. `handler`'s `this` is the same job context every `registerCronJob`/`registerJob`
handler gets (`this.providers`/`this.connectors`/`this.interactors`).

## 3. `DLQProcessorOptions` reference

| Option            | Required | Default  | Notes                                                                                                                                                                                                            |
| ----------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | yes      | —        | Becomes part of the underlying cron job's own name (`dlq:<name>`) — must be unique across all cron jobs.                                                                                                         |
| `schedule`        | yes      | —        | `registerCronJob`'s own real `CronJobDefinitionBase['schedule']` field — a 6-field cron expression, `Pick`ed directly rather than redeclared, so this type can never silently drift from the real cron contract. |
| `isActive`        | no       | `true`   | Same field as `registerCronJob`'s own `isActive`.                                                                                                                                                                |
| `processingQueue` | no       | `'soft'` | `'soft' \| 'moderate' \| 'intensive'` — same weight semantics as any other cron/job.                                                                                                                             |
| `handler`         | yes      | —        | `(entry: DLQEntryAttrs) => Promise<unknown> \| unknown`, called with the claimed entry.                                                                                                                          |

## 4. Testing a processor without a live broker

`registerDLQProcessor` only needs a real Mongo connection and the cron/task registry — no RabbitMQ
required to test the claim → handler → complete/fail cycle directly:

```ts
import { ProgramModule } from '@zanix/server'
import { getTask } from 'utils/tasks.ts'
import { CRONS_METADATA_KEY } from 'utils/constants.ts'

const getRegisteredCronTask = (cronName: string) => {
  const [, jobDef] = ProgramModule.registry.get(CRONS_METADATA_KEY).find((
    [name],
  ) => name === cronName)
  return {
    task: getTask(jobDef.args.$taskId, jobDef.queue),
    args: jobDef.args.$args,
  }
}

// ... registerDLQProcessor(...), then invoke the real registered task directly:
const { task, args } = getRegisteredCronTask('dlq:reprocess-payment')
await task.call({ providers: { get: () => dlq } }, args)
```

See `src/@tests/functional/jobs/dlq.test.ts` in this package for the full working pattern (claim →
handler → complete, a throwing handler, and an empty tick that never invokes the handler).
