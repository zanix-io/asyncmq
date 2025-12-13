# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this project
adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
