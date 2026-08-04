# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project
adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] - 2026-08-03

### Fixed

- `setup()`'s queue-options cache key (`SUBSCRIBERS_METADATA_KEY`) is now namespaced by `project` —
  it was previously a fixed, package-wide string, so any two services sharing the same
  `cache`/`kvLocal` backend (e.g. the same Redis instance across a fleet of microservices, a common
  setup) read and wrote the _same_ key. Whichever service last ran `setup()` clobbered the others'
  stored options, so the next service's queue-recreation path
  (`consumeAllMessages(fullQueuePath, oldOptions)`) ended up asserting its own, correctly-named
  queue with another service's `deadLetterRoutingKey` — RabbitMQ rejects this with
  `406 PRECONDITION-FAILED (inequivalent arg 'x-dead-letter-routing-key')`, even though the queue
  name itself was correct. Confirmed against a real incident: two services on one shared Redis
  instance, each declaring the other's dead-letter routing key on its own queue.

## [0.5.0] - 2026-08-01

### Added

- Added a new `provider` option to `runJob`, allowing callers to specify which AsyncMQ provider slot
  should be used when publishing a job.
- `runJob` continues to default to the core `'asyncmq'` provider, making this change fully backward
  compatible.
- Introduced this option as a forward-compatible API for future multi-broker support while keeping
  job registrations broker-agnostic and compatible with both `runJob` and `runTask`.

## [0.4.0] - 2026-07-25

### Added

- `setTaskerUrl(url)` (from `@zanix/asyncmq/worker`): registers the bootstrap module a spawned
  Worker thread runs when `ZanixCoreWorkerProvider.runTask` dispatches a job locally (the no-AMQP
  fallback). AsyncMQ ships no built-in one anymore — the caller (typically `@zanix/core`) must
  provide it. Without a registered tasker URL, `runTask` logs a clear error and returns `false`
  instead of failing silently.
- `registerInternalProcess()`: marks the current process as AsyncMQ's internal worker thread
  (`ZANIX_WORKER_EXECUTION=internal-process`), so callers don't need to know the literal env var
  contract.
- `baseProcessor` and the `ProcessorOptions`/`FullProcessingQueue`/`ProcessingQueues` types, now
  re-exported from `@zanix/asyncmq/worker` for anyone building a custom tasker bootstrap module.
- `initWorkerEntrypoint(loadDependencies?)` (from `@zanix/asyncmq/worker`): the shared
  target-initialization lifecycle (`onSetup`/`onBoot`/`postBoot` + metadata cleanup) needed by both
  an internal-process entrypoint and a standalone extra-process worker — callers mark their own
  execution mode first (`registerInternalProcess()`/`registerExtraProcessQueues()`), then run this
  for the part both share.
- `ZanixCoreWorkerProvider` now re-exported from the root entrypoint, so
  `ProgramModule.providers
  .get<ZanixCoreWorkerProvider>('worker')` can be typed without reaching
  into internal module paths.
- Re-exported several types that already existed but weren't reachable from the root entrypoint
  (`IZanixSubscriber`, `SubscriberDecoratorOptions`, `QueueConfig`, `QueueOptions`, `AssertQueue`,
  `Execution`, `CronJobDefinition`, `CronJobDefinitionBase`, `BaseJob`, `JobDefinition`,
  `JobProcess`) — needed for `deno doc --lint` and the JSR documentation score.

### Fixed

- `ZanixRabbitMQConnector#consumeAllMessages` now closes the channel it created internally when the
  target queue is empty — it previously returned early without closing it, leaking one AMQP channel
  per empty-queue call (the non-empty path already closed it correctly).

### Changed

- **Breaking**: `src/modules/worker/e-process.ts` (the standalone worker runnable script) and
  `i-process.ts`/`dependencies.ts` (the internal-process worker-thread bootstrap) were removed.
  `@zanix/asyncmq/worker` is now a library of bootstrap building blocks
  (`registerExtraProcessQueues`, `setTaskerUrl`, `workerFileTypes`, etc.), not a runnable script —
  running a standalone worker now means bootstrapping through `@zanix/core`'s `Zanix.startWorker()`,
  which wires all of this up automatically. See the README's "Running the Worker" section for the
  manual/standalone pattern.
- `nextCronDate` (cron expression parsing) moved to `@zanix/utils`'s helpers — it's generic
  date/schedule math with no AsyncMQ-specific dependency. Import it from `@zanix/helpers` if you
  need it directly; internal usages (`subscribers/handler.ts`, `rabbitmq/provider/mod.ts`) were
  updated accordingly.
- Removed the `@zanix/datamaster` dependency entirely — AsyncMQ no longer imports datamaster or
  notifications directly; that integration glue now lives in `@zanix/core`.
- Bumped `@zanix/server` to `2.*` and `@zanix/utils`-derived dependencies (`@zanix/helpers`,
  `@zanix/logger`, `@zanix/errors`, `@zanix/workers`, `@zanix/typings`, `@zanix/validator`) to
  `2.3.x`.
- README rewritten and corrected: the `Queue`/`ZanixQueue` names from an earlier
  `Subscriber`/`ZanixSubscriber` rename were still used throughout every example; several examples
  referenced APIs that don't exist (`server.getProvider(...)`) or attributed `executeGeneralTask` to
  AsyncMQ instead of its real owner (`@zanix/server`'s `ZanixWorkerProvider`); `runTask`'s and
  `onerror`'s documented callback/handler signatures didn't match the real ones. The detailed
  Scheduling/Cron Jobs and Worker/Task Execution content moved to `docs/scheduling-and-cron.md` and
  `docs/worker.md` (linked from the README) — the latter now documents the actual
  `initWorkerEntrypoint`-based custom-entrypoint pattern (mirroring `@zanix/core`'s own
  `worker.ts`/`tasker.ts` pair) instead of a vague "build it yourself" note.
- Validated the docs against a real production consumer: the `this.worker`/`this.asyncmq`
  Interactor-bound getters (the pattern real job dispatch actually uses, vs. the module-level
  `ProgramModule.providers.get(...)` lookup) were undocumented; the job `handler`'s bound `this`
  context (`this.providers`, `this.context.attempt`) and the `settings.retryConfig.maxRetries` /
  `context.attempt` retry-exhaustion pattern — used by every real job handler checked — had no
  example anywhere. Both are now covered in `docs/worker.md`.

## [0.3.12] - 2026-03-04

### Fixed

- **Cron expression** fixed for cron schedule

## [0.3.11] - 2026-01-17

### Fixed

- `processorHandler`'s retry backoff no longer blocks the handler with
  `await new
  Promise((res) => setTimeout(res, delay))` before acking — it now acks immediately and
  republishes the retried message through the scheduler queue with `expiration: delay` when a
  `backoffStrategy` is configured (or straight back to the queue when it isn't), instead of holding
  the channel open for the whole delay.
- `attempt` is now threaded through `Job`'s `this.context` and `ProcessorOptions`, so task/job
  handlers can read the current retry attempt from `this.context.attempt`.

## [0.3.10] - 2026-01-17

### Fixed

- `intensive`/`moderate`/`soft` queue subscribers now forward `attempt` from `MessageInfo` into the
  processor call, completing the `attempt`-threading fix above.

## [0.3.9] - 2026-01-17

### Fixed

- `intensive`/`moderate`/`soft` queue subscribers now `await` the processor call instead of firing
  it without awaiting, so a rejected task properly propagates instead of failing silently.

## [0.3.8] - 2025-12-23

### Fixed

- Cron messages for an inactive (`isActive: false`) cron now also release their dedup lock
  (`unlockMessage`) before returning, instead of leaving it held.

## [0.3.7] - 2025-12-23

### Fixed

- Cron messages for an inactive cron are now `nack`'d without requeue (`nack(msg, false, false)`)
  instead of implicitly requeuing, preventing an inactive cron's messages from looping.

## [0.3.6] - 2025-12-22

### Fixed

- `ZanixRabbitMQConnector#close` no longer throws if the underlying connection was never established
  (`this.#connection?.close()`).
- Cron messages for an inactive cron are now explicitly `nack`'d instead of just returning.

## [0.3.5] - 2025-12-22

### Fixed

- `setup()`'s dead-letter consumer now passes `{ noAck: false }` explicitly, matching the ack-based
  flow the rest of the retry/DLQ pipeline expects.
- The standalone worker script's `SIGINT` handler is now `async` and calls `closeAllConnections()`
  before exiting, so a manually-stopped worker closes its connections instead of exiting abruptly.

## [0.3.4] - 2025-12-21

### Added

- **Worker Provider** with support for:

  - Distributed **Jobs** executed via predefined or custom AMQP queues (`extra-process`)
  - Internal **Tasks** executed via `soft`, `moderate`, and `intensive` queues (`internal-process`)
- New execution methods:

  - `worker.runJob()` for distributed and persistent jobs
  - `worker.runTask()` for internal, ephemeral tasks
  - `worker.executeGeneralTask()` for lightweight generic tasks without DI
- Support for **internal Cron Tasks** running in `internal-process`
- Automatic execution context detection via `ZANIX_WORKER_EXECUTION`
- External worker CLI (`@zanix/asyncmq/worker`) to process predefined and custom AMQP queues

### Fixed

- Improved **concurrency locking mechanism** to prevent duplicated job execution
- More reliable worker message handling under parallel execution

## [0.3.3] - 2025-12-21

### Fixed

- Consolidated the per-execution-mode cron registry keys (`CRONS_METADATA_KEY['main-process']` /
  `['extra-process']`) into a single key — crons registered before the execution mode was known were
  being written under the wrong key and never executed.
- `ZanixCoreAsyncMQProvider` no longer runs cron execution at all when
  `ZANIX_WORKER_EXECUTION=extra-process`, since crons only ever run in the main/internal process.

## [0.3.2] - 2025-12-21

### Changed

- Removed the async, `setTimeout`-deferred "does this queue exist" validation added in 0.3.1 — it
  produced false-positive warnings against queues registered after the check ran.
- A job's `execution` is now read from `ZANIX_WORKER_EXECUTION` instead of being inferred from
  whether a `handler` was provided.

## [0.3.1] - 2025-12-21

### Changed

- Custom-queue job registration validates the target queue exists against the subscriber registry
  and logs a warning (previously threw `InternalError`) if it doesn't — validation ran
  asynchronously (deferred via `setTimeout`) to run after same-tick subscriber registration.
  Superseded in 0.3.2 (see above).

## [0.3.0] - 2025-12-21

### Added

- Internal task-registry infrastructure (`utils/tasks.ts`, `utils/context.ts`, `utils/jobs.ts`,
  `typings/worker.ts`) laying the groundwork for the Worker Provider (`runJob`/`runTask`) that
  landed in 0.3.4 below.

## [0.2.1] - 2025-12-13

### Fixed

- The default `@Provider('asyncmq')` registration now uses `startMode: 'postBoot'` instead of the
  implicit default, so it initializes after the rest of the app's providers/connectors are ready.
- A cron job's message now falls back to a descriptive placeholder (`cron message by "<name>"`)
  instead of `undefined` when no `args` were provided.
- `CronJobDefinition['args']` is now optional, matching the fallback above.

## [0.2.0] - 2025-12-13

### Added

- Support for scheduling messages to be published at a future time using `schedule`.
  - Messages can be scheduled by specifying an absolute date (`date`) or a delay in milliseconds
    (`delay`).
  - Optionally resolves queue names using the internal queue path mechanism (`isInternal`).
- Support for cron jobs using a Domain-Specific Language (DSL) via `registerCronJob`.
  - Allows registration of recurring jobs with cron expressions.
  - Cron job executions include metadata in `OnMessageInfo` for handlers.
  - Fully integrated with AsyncMQ’s retry and error handling system.

## [0.1.1] - 2025-12-11

### Fixed

- `prepareOptions` now encrypts the serialized request context (`encode`) instead of sending it as
  plain `JSON.stringify` in message headers, and preserves the resolved `scopedContext`'s own fields
  instead of only `id`/`cookies`/`locals`.
- Renamed `encodeMessage`/`decodeMessage` to `encode`/`decode` for consistency with the rest of the
  message-handling utilities.

## [0.1.0] - 2025-12-11
