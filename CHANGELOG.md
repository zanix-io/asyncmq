# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project
adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- README rewritten: no more standalone-worker-script instructions, the `setTaskerUrl` contract is
  documented, and a note recommends `@zanix/core` as the entrypoint for full applications.

## [0.3.12] - 2026-03-04

### Fixed

- **Cron expression** fixed for cron schedule

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

## [0.1.0] - 2025-12-11
