# Zanix – AsyncMQ

[![Version](https://img.shields.io/jsr/v/@zanix/asyncmq?color=blue\&label=jsr)](https://jsr.io/@zanix/asyncmq/versions)
[![Release](https://img.shields.io/github/v/release/zanix-io/asyncmq?color=blue\&label=git)](https://github.com/zanix-io/asyncmq/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)

---

## 🧭 Table of Contents

1. [Description](#-description)
2. [Features](#-features)
3. [Installation](#-installation)
4. [Basic Usage](#-basic-usage)
5. [Dead Letter Queue Reprocessing](#-dead-letter-queue-reprocessing)
6. [Queue Handlers](#-queue-handlers)
7. [Worker & Task Execution](#-worker--task-execution)
8. [Environment Variables](#-environment-variables)
9. [Encryption](#-encryption)
10. [Connector Auto-Loading](#-connector-auto-loading)
11. [Documentation](#-documentation)
12. [Contributing](#-contributing)
13. [Changelog](#-changelog)
14. [License](#-license)
15. [Resources](#-resources)

---

## 🧩 Description

**Zanix AsyncMQ** is the asynchronous message queue module of the **Zanix ecosystem**, providing a
clean, extensible interface for interacting with message brokers like **RabbitMQ** through the Zanix
Connector/Provider architecture.

This module enables:

- Queue subscription and message processing
- DTO-based validation of incoming messages (`rto`)
- Automatic connector/provider registration
- Interactor-based queue task execution
- Safe AMQP channel management
- Encrypted message payloads using `DATA_AMQP_SECRET`

Designed for event-driven architectures, background jobs, pipelines, and microservices.

> 💡 If you're building a full application, the recommended entrypoint is
> **[`@zanix/core`](https://jsr.io/@zanix/core)**, which wires this package together with
> `@zanix/datamaster`, `@zanix/auth`, and `@zanix/notifications` automatically via
> `Zanix.start()`/`Zanix.startWorker()`. Depend on `@zanix/asyncmq` directly when you need its
> queue/job primitives standalone, or low-level control over the worker bootstrap.

---

## ✨ Features

### **RabbitMQ Connector**

**`ZanixRabbitMQConnector`**

Manages all AMQP connection logic:

- Handles connection and reconnection
- Creates lightweight channels with restricted operations
- Declares queues, bindings, and consumers
- Provides `ack`, `nack`, and channel lifecycle tools (automatically)
- Extends `ZanixAsyncmqConnector` from the Zanix core

---

### **AsyncMQ Provider**

**`ZanixCoreAsyncMQProvider`**

Responsible for:

- Initializing the connector
- Registering queues and their handlers
- Validating payloads using DTOs (`rto`)
- Routing messages to the correct queue processor
- Managing retries and failures
- Publishing messages to specific queues or topics
- Schedule messages and execute cron jobs
- Integrating seamlessly with Zanix Providers

---

### **Subscriber Decorator**

`@Subscriber(options | route)`

Registers a class as a queue handler.

Supports:

- Simple queue name or full config object
- Message DTO validation via `rto`
- Typed Interactors
- Automatic queue binding
- Cleaner queue service architecture

---

### **Subscriber Handler Base Class**

**`ZanixSubscriber<Interactor>`**

An abstract class used to define asynchronous queue processors.

- Provides `onmessage(data, info)` for message handling
- Guarantees that `data` arrives encrypted/decoded and validated
- Supports typed access to an Interactor instance
- Extends `HandlerGenericClass`

---

## 📦 Installation

Install using **JSR**:

```ts
import * as asyncmq from 'jsr:@zanix/asyncmq@[version]'
```

Import individual components:

```ts
import { Subscriber, ZanixRabbitMQConnector, ZanixSubscriber } from 'jsr:@zanix/asyncmq@[version]'
```

Check for latest versions at: [https://jsr.io/@zanix/asyncmq](https://jsr.io/@zanix/asyncmq)

---

## 🚀 Basic Usage

### 1. Define an Interactor

```ts
import { ZanixInteractor } from '@zanix/server'

class EmailInteractor extends ZanixInteractor {
  async send(email: string) {
    console.log('Sending email to:', email)
  }
}
```

---

### 2. Create a DTO for validation

```ts
import { BaseRTO, IsString } from '@zanix/validator'

class EmailRto extends BaseRTO {
  @IsString({ expose: true })
  accessor email!: string
}
```

---

### 3. Create a Subscriber Handler

```ts
import { Subscriber, ZanixSubscriber } from 'jsr:@zanix/asyncmq@latest'
import type { MessageInfo } from 'jsr:@zanix/asyncmq@latest'

@Subscriber({
  queue: 'email.send',
  Interactor: EmailInteractor,
  rto: EmailRto, // validate incoming message
})
class EmailSubscriber extends ZanixSubscriber<EmailInteractor> {
  async onmessage(data: { email: string }, info: MessageInfo) {
    await this.interactor.send(data.email)
  }
}
```

---

### 4. Enqueue or Publish a message

From inside an Interactor (or any class extending `@zanix/server`'s `CoreBaseClass`), the provider
is already available as `this.asyncmq` — that's the idiomatic way to reach it in practice. Outside a
Zanix-managed class, reach it through `ProgramModule` instead:

```ts
import { ProgramModule } from '@zanix/server'
import type { ZanixCoreAsyncMQProvider } from 'jsr:@zanix/asyncmq@latest'

const asyncmq = ProgramModule.providers.get<ZanixCoreAsyncMQProvider>(
  'asyncmq',
)

await asyncmq.enqueue('email.send', { email: 'user@example.com' }, {
  isInternal: true,
  contextId: '',
})
await asyncmq.sendMessage('*', { message: 'hello queue' }, { contextId: '' }) // all queues
```

---

### 5. Message Scheduling & Cron Jobs

Zanix AsyncMQ provides **first-class support for delayed messages and recurring jobs**: schedule a
message for future delivery via the provider's `schedule` method, or register a recurring job with
`registerCronJob` using a cron DSL. Both are encrypted, persisted, and integrate with the same
retry/DLQ system as regular messages.

```ts
await asyncmq.schedule('email.send', { email: 'user@example.com' }, {
  delay: 60_000,
}) // 1 minute
```

See **[Message Scheduling & Cron Jobs](./docs/scheduling-and-cron.md)** for the full reference
(scheduling options, cron job definition, execution metadata, retries, use cases).

---

## 💀 Dead Letter Queue Reprocessing

`@zanix/asyncmq/dlq` — a separate subpath, so importing the rest of `@zanix/asyncmq` never pulls in
`@zanix/datamaster`'s module graph — provides `registerDLQProcessor`: a thin wrapper over
`registerCronJob` that reprocesses `@zanix/datamaster`'s `DLQProvider` entries, distinct from
RabbitMQ's own broker-native dead-letter mechanism (`ZanixAsyncMQProvider.requeueDeadLetters`,
mentioned above).

```ts
import { registerDLQProcessor } from '@zanix/asyncmq/dlq'

registerDLQProcessor('payment.process', {
  name: 'retry-failed-payments',
  schedule: '0 */5 * * * *', // every 5 minutes
  handler: async function (entry) {
    await this.providers.get(PaymentService).retry(entry.payload)
  },
})
```

See **[Dead Letter Queue Reprocessing](./docs/dlq-reprocessing.md)** for the full reference (what
happens on every tick, `DLQProcessorOptions`, testing without a live broker) and
`@zanix/datamaster`'s `docs/dlq.md` for `DLQProvider`'s own lifecycle, `registerDLQModel`, and
payload protection.

---

## 📡 Queue Handlers

Each queue receives:

| Field  | Description                                         |
| ------ | --------------------------------------------------- |
| `data` | The validated payload (validated via the `rto` DTO) |
| `info` | Metadata: deliveryTag, attempt count, etc.          |

### ✔️ Validation Flow with `rto`

1. Message arrives from AMQP
2. If encryption enabled → decrypted
3. Parsed as JSON
4. Validated with the schema specified in `rto`
5. Delivered to `onmessage` only if valid

Invalid payloads are logged and routed to DLQ.

---

## 🔄 Worker & Task Execution

Zanix AsyncMQ executes **distributed jobs** (durable, via predefined `soft`/`moderate`/`intensive`
AMQP queues or a custom queue) and **internal tasks** (ephemeral, via the same predefined queues but
run locally) through its **Worker Provider**.

```ts
import { ProgramModule } from '@zanix/server'
import type { ZanixCoreWorkerProvider } from 'jsr:@zanix/asyncmq@latest'

const worker = ProgramModule.providers.get<ZanixCoreWorkerProvider>('worker')

await worker.runJob('my-custom-job', { args: { message: 'Hello!' } }) // distributed job
worker.runTask('my-moderate-task', { args: { message: 'Hello local!' } }) // internal task
```

See **[Worker & Task Execution](./docs/worker.md)** for the full reference: Jobs vs Tasks,
registering jobs/cron jobs/custom Subscribers, `executeGeneralTask`, and — most importantly — how to
run the worker (through `@zanix/core`, or by building your own internal-process/ extra-process
entrypoints with `initWorkerEntrypoint`).

---

## 🌐 Environment Variables

| Variable           | Description                                         | Example                           |
| ------------------ | --------------------------------------------------- | --------------------------------- |
| `AMQP_URI`         | RabbitMQ or AMQP connection URI                     | `amqp://user:pass@localhost:5672` |
| `DATA_AMQP_SECRET` | Secret key for encrypting/decrypting queue payloads | `my-32-byte-secret-key`           |

When `AMQP_URI` is present, the default connector and provider are automatically registered.

---

## 🔐 Encryption

- All outgoing messages are encrypted
- All incoming messages are decrypted before validation
- AES-based authenticated encryption ensures confidentiality + integrity

Perfect for:

- Sensitive user data
- Tokens
- System events
- Internal service communication

---

## 🚀 Connector Auto-Loading

This module includes core auto-registration logic:

```ts
/**
 * Automatically registers the default AsyncMQ connector and provider
 * if the environment variable `AMQP_URI` is set.
 */
```

That means:

- Plug-and-play RabbitMQ support
- No need for manual provider configuration
- Works across microservices and workers instantly

`@zanix/asyncmq/core` also exports the two functions behind that auto-registration —
`registerRabbitMQConnector` (connector + provider) and `registerWorkerProvider` (worker provider) —
each still running automatically once at import time, exactly as above. The export exists for the
rare case of re-registering after clearing the relevant registry (a config reload in a long-running
process, or a test simulating a different env state between cases); most apps never need to call
these directly.

---

## 📚 Documentation

Full reference guides live under [`docs/`](./docs):

- **[Message Scheduling & Cron Jobs](./docs/scheduling-and-cron.md)** — `schedule`,
  `registerCronJob`, execution metadata, retries.
- **[Worker & Task Execution](./docs/worker.md)** — Jobs vs Tasks, predefined queues,
  `executeGeneralTask`, and running the worker (through `@zanix/core` or with your own
  internal-process/extra-process entrypoints).
- **[Dead Letter Queue Reprocessing](./docs/dlq-reprocessing.md)** — `registerDLQProcessor`
  (`@zanix/asyncmq/dlq`), `DLQProcessorOptions`, testing without a live broker. See also
  `@zanix/datamaster`'s `docs/dlq.md` for `DLQProvider`'s own lifecycle, `registerDLQModel`, and
  payload protection.

---

## 🤝 Contributing

1. Open an issue for bugs or feature suggestions.
2. Fork the repository and create a feature branch.
3. Implement changes following project conventions.
4. Add or update tests where appropriate.
5. Create a pull request with a clear description.

---

## 🕒 Changelog

See [`CHANGELOG`](./CHANGELOG.md) for version history.

---

## 📜 License

Licensed under the **MIT License**. See the [`LICENSE`](./LICENSE) file for details.

---

## 🔗 Resources

- Zanix Framework — [https://github.com/zanix-io](https://github.com/zanix-io)
- Deno Documentation — [https://deno.com](https://deno.com)
- Repository — [https://github.com/zanix-io/asyncmq](https://github.com/zanix-io/asyncmq)

---

_Developed with ❤️ by Ismael Calle | [@iscam2216](https://github.com/iscam2216)_
