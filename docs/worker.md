# Worker & Task Execution

Zanix AsyncMQ allows executing **distributed jobs** and **internal tasks** via its **Worker
Provider**, using different types of queues depending on the workload.

---

## 1. Jobs vs Tasks

| Type     | Executed on                                                               | Persistence             | Recommended use                                  |
| -------- | ------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------ |
| **Job**  | Predefined AMQP queues (`soft`, `moderate`, `intensive`) or custom queues | Durable and distributed | Critical processes, retryable, shared queues     |
| **Task** | Internal queues (`soft`, `moderate`, `intensive`)                         | Ephemeral               | Quick execution, local tasks without persistence |

> ⚠️ Predefined AMQP queues **always run in `extra-process`**, so it is necessary to run the
> external worker (`@zanix/asyncmq/worker`) to process them. Internal tasks use the `soft`,
> `moderate`, or `intensive` queues and **do not require an external worker**, as they run in an
> **internal-process** context.

---

## 2. Predefined Queues

| Queue       | Type                    | Execution        | Description                  |
| ----------- | ----------------------- | ---------------- | ---------------------------- |
| `soft`      | Internal task           | internal-process | Light local tasks, ephemeral |
| `moderate`  | Internal task           | internal-process | Medium load local tasks      |
| `intensive` | Internal task           | internal-process | Heavy local tasks            |
| `soft`      | Predefined AMQP for job | extra-process    | Lightweight distributed jobs |
| `moderate`  | Predefined AMQP for job | extra-process    | Medium load distributed jobs |
| `intensive` | Predefined AMQP for job | extra-process    | Heavy distributed jobs       |

---

## 3. Jobs and Cron Jobs Examples

```ts
import { registerCronJob, registerJob } from 'jsr:@zanix/asyncmq@latest'

// Distributed job in a custom AMQP queue
registerJob({
  name: 'my-custom-job',
  args: { message: 'hello custom queue' },
  customQueue: 'extra-process-queue', // runs in extra-process custom queue
})

// Internal task in the moderate queue
const MAX_RETRIES = 5
registerJob({
  name: 'my-moderate-task',
  args: { message: 'hello local moderate queue' },
  processingQueue: 'moderate', // internal-process
  settings: { retryConfig: { maxRetries: MAX_RETRIES } },
  handler: async function (args: { message: string }) {
    // SomeRepository is your own @zanix/server ZanixProvider — not part of asyncmq.
    const repository = this.providers.get(SomeRepository)

    try {
      await repository.markProcessing(args.message)
    } catch (error) {
      if (this.context.attempt >= MAX_RETRIES) {
        // Retries exhausted — persist the failure instead of letting AsyncMQ retry again.
        await repository.markFailed(args.message, error)
        return
      }
      throw error // re-throw so AsyncMQ retries with backoff
    }
  },
})

// Internal cron job in the soft queue
registerCronJob({
  name: 'my-handler-cron',
  isActive: true,
  args: { message: 'hello cron soft queue' },
  processingQueue: 'soft', // internal-process
  handler: function (args: { message: string }) {
  },
  schedule: '*/2 * * * * *',
})
```

The `handler` function's `this` is bound to the execution context — `this.providers`/
`this.connectors`/`this.interactors` (the same getters an Interactor uses) and `this.context`
(including `this.context.attempt`, the current retry attempt, and `this.context.queue`). A handler
that throws is retried up to `settings.retryConfig.maxRetries` (default comes from
`QueueMessageOptions`); checking `this.context.attempt` against that same limit — as above — is how
a handler tells "still retrying" apart from "this was the last attempt" without duplicating the
retry count.

See [Message Scheduling & Cron Jobs](./scheduling-and-cron.md) for the full `registerCronJob`
reference.

---

## 4. Custom Subscriber (extra-process)

```ts
import { Subscriber, ZanixSubscriber } from 'jsr:@zanix/asyncmq@latest'

@Subscriber({
  queue: { topic: 'extra-process-queue', execution: 'extra-process' },
})
export class _Subscriber extends ZanixSubscriber {
  protected async onmessage(args: { message: string }) {
  }
}
```

---

## 5. Running Jobs and Tasks

From inside an Interactor (or any class extending `@zanix/server`'s `CoreBaseClass`), the worker
provider is already available as `this.worker` — this is how real job dispatch is actually done in
practice, propagating `contextId` so the job can be correlated back to the request that triggered
it:

```ts
class LedgerInteractor extends ZanixInteractor {
  async mint(amount: number) {
    // Distributed job (extra-process or custom queue) — fire-and-forget, contextId for tracing.
    await this.worker.runJob('my-custom-job', {
      args: { amount },
      contextId: this.contextId,
    })
  }
}
```

Outside a Zanix-managed class, reach the same provider through `ProgramModule` (see
[Enqueue or Publish a message](../README.md#4-enqueue-or-publish-a-message) for the equivalent with
the `asyncmq` provider):

```ts
import { ProgramModule } from '@zanix/server'
import type { ZanixCoreWorkerProvider } from 'jsr:@zanix/asyncmq@latest'

const worker = ProgramModule.providers.get<ZanixCoreWorkerProvider>('worker')

// Internal tasks (soft/moderate/intensive)
worker.runTask('my-moderate-task', {
  args: { message: 'Hello local!' },
  callback: (response) => console.log(response.response),
})
```

> ⚠️ `runTask` dispatches to a real internal worker thread, whose bootstrap module must be
> registered beforehand via `setTaskerUrl` (exported from `@zanix/asyncmq/worker`) — otherwise it
> logs an error and returns `false` instead of running the task. If your app bootstraps through
> `@zanix/core`, this is handled for you automatically; see
> [Running the Worker](#7-running-the-worker) below for what's required when using AsyncMQ
> standalone.

### `runJob`'s `provider` option

`runJob` publishes through the `'asyncmq'` core provider slot by default — the single AsyncMQ broker
connection every app has today. `options.provider` lets you target a different provider slot
instead:

```ts
await this.worker.runJob('my-custom-job', {
  args: { amount },
  provider: 'secondary-broker', // only meaningful once a second AsyncMQ provider is registered
})
```

This is forward-looking: `@zanix/asyncmq` doesn't yet support registering a _second_ simultaneous
broker provider under a different slot (`'asyncmq'` is one of `@zanix/server`'s reserved core slots,
currently singular), so there's nothing to pass here in practice yet. The option exists so that
choice — if it's ever needed — lives at the **call site** (`runJob`), not baked into `registerJob`.
A job's registration stays broker-agnostic on purpose: the exact same registered job already runs
unchanged through `runTask` (no provider/broker concept at all), so tying a job's _identity_ to a
specific broker at registration time would break that.

---

## 6. Executing Generic Tasks

For quick, moderate, or light tasks where no dependency injection is required, you can use
`executeGeneralTask` — inherited from `@zanix/server`'s `ZanixWorkerProvider` base class (not
specific to AsyncMQ). This method runs a function inside a default `WorkerManager` instance (with 3
workers by default) in an **internal-process** context.

```ts
const invokeTask = worker.executeGeneralTask(
  fn, // function to handle
  {
    metaUrl: import.meta.url, // Required metadata for the worker
    timeout: 5000, // Optional max execution time in ms
    callback: (response) => {
      if (response.error) console.error(response.error)
      else console.log('Result from task:', response.response)
    },
  },
)

// Invoke the task
invokeTask()
```

This is ideal for:

- Lightweight computations or transformations
- Non-persistent background tasks
- Quick local tasks where dependency injection is not required

> ⚠️ Like other internal queues (`soft`, `moderate`, `intensive`), generic tasks run in
> **internal-process** and **do not require** the external worker.

---

## 7. Running the Worker

To process **predefined AMQP queues** or **custom extra-process queues**, you need a running worker
process. `@zanix/asyncmq/worker` is a library of bootstrap building blocks
(`registerExtraProcessQueues`, `setTaskerUrl`, `initWorkerEntrypoint`, `workerFileTypes`, etc.) — it
is **not** a runnable script by itself.

### The easy way: `@zanix/core`

If your app is built through `@zanix/core` (the recommended entrypoint — see the
[README's Description](../README.md#-description)), it already wires all of this up for you:

```ts
// worker.ts
import Zanix from '@zanix/core'

Zanix.startWorker()
```

```bash
deno run -A worker.ts
```

`Zanix.startWorker()` registers AsyncMQ's extra-process queues, registers `@zanix/core`'s own
internal-process bootstrap module as AsyncMQ's tasker URL (so `runTask`'s local fallback works
correctly), loads your project's own connectors/handlers/defs, and keeps the process alive.

### Building it yourself: two entrypoints, one shared lifecycle

A standalone setup (no `@zanix/core`) needs **two** pieces, each marking a different execution mode
but sharing the same initialization lifecycle:

1. **The main-thread bootstrap** — your `worker.ts`-equivalent script, the process you actually run
   (`deno run -A worker.ts`). It marks itself as the standalone extra-process worker and points
   `runTask`'s local fallback at the second piece below.
2. **The internal-process entrypoint** — a separate module `runTask` spawns as a real Worker thread
   when dispatching a task locally (the no-AMQP fallback). It's a **module**, not a class: there's
   no instantiation step, and the rest of the API (`registerJob`, `setTaskerUrl`, `baseProcessor`)
   is all plain functions. Because a spawned Worker thread has its own isolated module registry —
   function references can't cross a `postMessage` boundary — this file must independently re-run
   whatever job/handler registration the main thread already did.

Both pieces run the _same_ shared lifecycle helper, `initWorkerEntrypoint(loadDependencies?)`; only
how each one marks its own execution mode differs:

```ts
// worker.ts — the main-thread bootstrap (run this: `deno run -A worker.ts`)
import {
  initWorkerEntrypoint,
  registerExtraProcessQueues,
  setTaskerUrl,
  workerFileTypes,
} from '@zanix/asyncmq/worker'

// Point AsyncMQ's runTask fallback at the internal-process entrypoint below.
setTaskerUrl(import.meta.resolve('./internal-process.ts'))

await registerExtraProcessQueues()
await initWorkerEntrypoint(async () => {
  // ...register/scan this project's own jobs, providers, connectors here...
})
```

```ts
// internal-process.ts — the entrypoint runTask spawns as a real Worker thread
import { baseProcessor, initWorkerEntrypoint, registerInternalProcess } from '@zanix/asyncmq/worker'

registerInternalProcess()
await initWorkerEntrypoint(async () => {
  // ...re-register/scan the SAME jobs, providers, connectors as worker.ts above —
  // this thread has its own isolated module registry, nothing carries over automatically.
})

export const processor = baseProcessor
```

`initWorkerEntrypoint` runs, in order: the optional `loadDependencies` callback (registering
jobs/handlers/providers) → the `onSetup`/`onBoot`/`postBoot` target-initialization phases (so
`this.providers`/`this.connectors` resolve correctly inside a task handler) → metadata cleanup.
`loadDependencies` runs _before_ any initialization phase deliberately, so anything it registers is
visible regardless of which phase it belongs to. If a task/job never needs providers or connectors,
`loadDependencies` can be omitted entirely — job registration itself isn't tied to any particular
phase.

**Real-world reference** — `@zanix/core`'s own `Zanix.startWorker()` is built exactly this way, as a
pair of files:

- `src/modules/worker.ts` (the main-thread side) calls `registerWorkerTaskerUrl()` — which is
  `setTaskerUrl(import.meta.resolve('../modules/tasker.ts'))` — to point AsyncMQ at `tasker.ts`,
  marks its own mode via `registerExtraProcessQueues()`, then runs
  `initWorkerEntrypoint(async ()
  => { await defineLocalMetadata('.', workerFileTypes()); await defineCoreMetadata() })`
  to load the consuming app's own files.
- `src/modules/tasker.ts` (the entrypoint module itself) marks its own mode via
  `registerInternalProcess()`, then runs the _identical_ `initWorkerEntrypoint(...)` call as
  `worker.ts` above, before exporting `processor`.

Only the mode-marking call differs between the two (`registerExtraProcessQueues()` vs.
`registerInternalProcess()`) — that's the one part that can't be shared, since each declares a
different `ZANIX_WORKER_EXECUTION` value. Everything else — loading the project's own dependencies
and running the initialization lifecycle — is the same call in both files.

> ⚠️ Internal queues (`soft`, `moderate`, `intensive`) for **local tasks** **do not require** the
> external worker and run automatically in the `internal-process` context — but they do require
> `setTaskerUrl` to have been registered (see above).

---

## 8. Informative Environment Variable

During execution, the system internally manages:

```text
ZANIX_WORKER_EXECUTION
```

Possible values:

| Value              | Meaning                                       |
| ------------------ | --------------------------------------------- |
| `main-process`     | Main application execution (default)          |
| `extra-process`    | Execution in an external worker (AMQP jobs)   |
| `internal-process` | Execution in an internal worker (local tasks) |

> This variable is **automatically managed by the system** and **is only for internal reference**.
> It should **not be manually set**.

### 8.1 Configured vs. Detected Execution

These three values look similar but split into two different concepts, and it matters which one
you're dealing with:

- **`main-process` and `extra-process` are things YOU configure** — the `execution` option on a
  `@Subscriber`'s `queue` or a job's `QueueConfig`. Pick one directly, same as any other setting.
- **`internal-process` is never something you configure.** It's a fact the system detects about the
  process it's currently running in — set automatically when your code is executing inside AsyncMQ's
  own internal worker thread (the one that transparently backs `main-process`-configured local tasks
  — see §1's `soft`/`moderate`/`intensive` internal queues above). There's no
  `execution: 'internal-process'` option to set on a subscriber or job.

An analogy: `main-process` is "I do the work myself, at my desk"; `extra-process` is "I send the
work to a separate office, in its own building" (a standalone worker process, full isolation);
`internal-process` is "I sent it to a separate room inside my OWN office" (an isolated thread, but
still the same process) — nobody asks for that room by name, the system just uses it transparently
when a local task needs to run in isolation.

---

## See also

- [Message Scheduling & Cron Jobs](./scheduling-and-cron.md) — `registerCronJob`'s full reference,
  and how cron jobs route through the predefined queues described here.
- [README](../README.md) — package overview, installation, and the basic Subscriber/Interactor flow.
