# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project
adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
