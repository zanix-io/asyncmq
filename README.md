# Zanix – AsyncMQ

[![Version](https://img.shields.io/jsr/v/@zanix/asyncmq?color=blue\&label=jsr)](https://jsr.io/@zanix/asyncmq/versions)
[![Release](https://img.shields.io/github/v/release/zanix-io/asyncmq?color=blue\&label=git)](https://github.com/zanix-io/asyncmq/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)

---

## 🧭 Table of Contents

- [🧩 Description](#🧩-description)
- [⚙️ Features](#⚙️-features)
- [📦 Installation](#📦-installation)
- [🚀 Basic Usage](#🚀-basic-usage)
- [📡 Queue Handlers](#📡-queue-handlers)
- [🌐 Environment Variables](#🌐-environment-variables)
- [🔐 Encryption](#🔐-encryption)
- [⚙️ Connector Auto-Loading](#⚙️-connector-auto-loading)
- [🤝 Contributing](#🤝-contributing)
- [🕒 Changelog](#🕒-changelog)
- [⚖️ License](#⚖️-license)
- [🔗 Resources](#🔗-resources)

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

---

## ⚙️ Features

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
- Integrating seamlessly with Zanix Providers

---

### **Queue Decorator**

`@Queue(options | route)`

Registers a class as a queue handler.

Supports:

- Simple queue name or full config object
- Message DTO validation via `rto`
- Typed Interactors
- Automatic queue binding
- Cleaner queue service architecture

---

### **Queue Handler Base Class**

**`ZanixQueue<Interactor>`**

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
import { Queue, ZanixQueue, ZanixRabbitMQConnector } from 'jsr:@zanix/asyncmq@[version]'
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
class EmailRto extends BaseRTO {
  @IsString({ expose: true })
  accessor email!: string
}
```

---

### 3. Create a Queue Handler

```ts
import { Queue, ZanixQueue } from 'jsr:@zanix/asyncmq@latest'

@Queue({
  queue: 'email.send',
  Interactor: EmailInteractor,
  rto: EmailRto, // validate incoming message
})
class EmailQueue extends ZanixQueue<EmailInteractor> {
  async onmessage(data: { email: string }, info: any) {
    await this.interactor.send(data.email)
  }
}
```

---

### 4. Enqueue or Publish a message

```ts
const asyncmq = server.getProvider('asyncmq')

await asyncmq.enqueue('email.send', { email: 'user@example.com', isInternal: true, contextId: '' })
await asyncmq.sendMessage('*', { message: 'hello queue' }, { contextId: '' }) // all queues
```

---

### 5. ⏰ Message Scheduling & Cron Jobs

Zanix AsyncMQ provides **first-class support for delayed messages and recurring jobs**, allowing you
to schedule messages for future execution or define cron-based tasks using a simple DSL.

This enables:

- Delayed background jobs
- Time-based workflows
- Periodic tasks (cron jobs)
- Event replays and retries

---

#### 🕒 Scheduling a Message

You can schedule a message to be delivered **at a specific date** or **after a delay** using the
provider’s `schedule` method.

##### Example: Schedule by Delay

```ts
const asyncmq = server.getProvider('asyncmq')

await asyncmq.schedule(
  'email.send',
  { email: 'user@example.com' },
  {
    delay: 60_000, // 1 minute
    isInternal: true,
  },
)
```

##### Example: Schedule by Date

```ts
await asyncmq.schedule(
  'email.send',
  { email: 'user@example.com' },
  {
    date: new Date('2025-01-01T10:00:00Z'),
    isInternal: true,
  },
)
```

##### Scheduling Options

| Option       | Type                  | Description                                                            |
| ------------ | --------------------- | ---------------------------------------------------------------------- |
| `date`       | `Date`                | Absolute date when the message should be delivered. Overrides `delay`. |
| `delay`      | `number`              | Delay in milliseconds before delivery (default: `0`).                  |
| `isInternal` | `boolean`             | Resolves the queue using the internal queue path mechanism.            |
| `...options` | `QueueMessageOptions` | Standard queue publishing options (except expiration).                 |

All scheduled messages are **encrypted**, **persisted**, and delivered exactly once at execution
time.

---

### 6. 📅 Cron Jobs (Recurring Tasks)

AsyncMQ supports **cron-based recurring jobs** using a **Domain-Specific Language (DSL)**.

Cron jobs are registered at startup and automatically scheduled by the provider.

---

#### Registering a Cron Job

```ts
import { registerCronJob } from 'jsr:@zanix/asyncmq@latest'

registerCronJob({
  name: 'minuteJob',
  isActive: true,
  queue: 'taskQueue',
  args: { foo: 'bar' },
  schedule: '0 */1 * * * *', // every minute
})
```

##### Cron Job Definition

| Field      | Type      | Description                                    |
| ---------- | --------- | ---------------------------------------------- |
| `name`     | `string`  | Unique name of the cron job.                   |
| `isActive` | `boolean` | Enables or disables the cron job.              |
| `queue`    | `string`  | Target queue where messages will be published. |
| `args`     | `any`     | Payload sent to the queue on each execution.   |
| `schedule` | `string`  | Cron expression (seconds precision supported). |
| `settings` | `string`  | Optional `QueueMessageOptions`.                |

---

#### Cron Execution Metadata

When a message is executed by a cron job, the queue handler receives additional metadata in the
`info` object:

```ts
async onmessage(data: any, info: OnMessageInfo) {
  console.log(info.cron)
}
```

```ts
info.cron = {
  name: 'minuteJob',
  expression: '0 */1 * * * *',
  nextExecution: Date,
}
```

This allows handlers to:

- Identify cron-triggered executions
- Access scheduling metadata.
- Implement custom logic for recurring jobs

---

#### ♻️ Error Handling & Retries

Cron jobs and scheduled messages integrate seamlessly with AsyncMQ’s retry system:

- Failed executions follow the same retry rules as normal messages
- Messages may be requeued or routed to DLQ
- `onError` handlers receive full scheduling metadata

```ts
async onerror(error: Error, info: OnErrorInfo) {
  console.log('Requeued:', info.requeued)
  console.log('Cron job:', info.cron?.name)
}
```

---

#### ✅ Use Cases

- Periodic cleanup jobs
- Daily reports
- Subscription renewals
- Scheduled notifications
- Background synchronization
- Deferred workflows

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

## ⚙️ Connector Auto-Loading

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

## ⚖️ License

Licensed under the **MIT License**. See the [`LICENSE`](./LICENSE) file for details.

---

## 🔗 Resources

- Zanix Framework — [https://github.com/zanix-io](https://github.com/zanix-io)
- Deno Documentation — [https://deno.com](https://deno.com)
- Repository — [https://github.com/zanix-io/asyncmq](https://github.com/zanix-io/asyncmq)

---

_Developed with ❤️ by Ismael Calle | [@iscam2216](https://github.com/iscam2216)_
