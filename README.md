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
- Schedule messages and execute cron jobs
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
async onmessage(data: any, info: MessageInfo) {
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
async onerror(error: Error, info: ErrorInfo) {
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

## 🛠 Worker & Task Execution

Zanix AsyncMQ allows executing **distributed jobs** and **internal tasks** via its **Worker
Provider**, using different types of queues depending on the workload.

---

### 1. Jobs vs Tasks

| Type     | Executed on                                                               | Persistence             | Recommended use                                  |
| -------- | ------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------ |
| **Job**  | Predefined AMQP queues (`soft`, `moderate`, `intensive`) or custom queues | Durable and distributed | Critical processes, retryable, shared queues     |
| **Task** | Internal queues (`soft`, `moderate`, `intensive`)                         | Ephemeral               | Quick execution, local tasks without persistence |

> ⚠️ Predefined AMQP queues **always run in `extra-process`**, so it is necessary to run the
> external worker (`@zanix/asyncmq/worker`) to process them. Internal tasks use the `soft`,
> `moderate`, or `intensive` queues and **do not require an external worker**, as they run in an
> **internal-process** context.

---

### 2. Predefined Queues

| Queue       | Type                    | Execution        | Description                  |
| ----------- | ----------------------- | ---------------- | ---------------------------- |
| `soft`      | Internal task           | internal-process | Light local tasks, ephemeral |
| `moderate`  | Internal task           | internal-process | Medium load local tasks      |
| `intensive` | Internal task           | internal-process | Heavy local tasks            |
| `soft`      | Predefined AMQP for job | extra-process    | Lightweight distributed jobs |
| `moderate`  | Predefined AMQP for job | extra-process    | Medium load distributed jobs |
| `intensive` | Predefined AMQP for job | extra-process    | Heavy distributed jobs       |

---

### 3. Jobs and Cron Jobs Examples

```ts
import { registerJob } from 'modules/jobs/task.defs.ts'
import { registerCronJob } from 'modules/jobs/cron.defs.ts'

// Distributed job in a custom AMQP queue
registerJob({
  name: 'my-custom-job',
  args: { message: 'hello custom queue' },
  customQueue: 'extra-process-queue', // runs in extra-process custom queue
})

// Internal task in the moderate queue
registerJob({
  name: 'my-moderate-task',
  args: { message: 'hello local moderate queue' },
  processingQueue: 'moderate', // internal-process
  handler: function (args: { message: string }) {
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

---

### 4. Custom Subscriber (extra-process)

```ts
import { Subscriber } from 'modules/subscribers/decorators/base.ts'
import { ZanixSubscriber } from 'modules/subscribers/base.ts'

@Subscriber({ queue: { topic: 'extra-process-queue', execution: 'extra-process' } })
export class _Subscriber extends ZanixSubscriber {
  protected async onmessage(args: { message: string }) {
  }
}
```

---

### 5. Running Jobs and Tasks

```ts
// Distributed jobs (extra-process or custom queue)
await worker.runJob('my-custom-job', { args: { message: 'Hello!' } })

// Internal tasks (soft/moderate/intensive)
worker.runTask('my-moderate-task', {
  args: { message: 'Hello local!' },
  callback: (err, result) => console.log(result),
})
```

---

### 6. Executing Generic Tasks

For quick, moderate, or light tasks where no dependency injection is required, you can use
`executeGeneralTask`. This method runs a function inside a default `WorkerManager` instance (with 3
workers by default) in an **internal-process** context.

```ts
const invokeTask = worker.executeGeneralTask(
  fn, // function to handle
  {
    metaUrl: import.meta.url, // Required metadata for the worker
    timeout: 5000, // Optional max execution time in ms
    callback: (err, result) => {
      if (err) console.error(err)
      else console.log('Result from task:', result)
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

### 7. Running the Worker

To process **predefined AMQP queues** or **custom extra-process queues**, run the external worker:

```bash
deno run -A @zanix/asyncmq/worker
```

This script:

- Initializes the AMQP queues.
- Processes distributed jobs.
- Listens and executes tasks published to extra-process queues.

> ⚠️ Internal queues (`soft`, `moderate`, `intensive`) for **local tasks** **do not require** the
> external worker and run automatically in the `internal-process` context.

---

### 8. Informative Environment Variable

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
