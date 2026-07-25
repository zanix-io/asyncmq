# Message Scheduling & Cron Jobs

Zanix AsyncMQ provides **first-class support for delayed messages and recurring jobs**, allowing you
to schedule messages for future execution or define cron-based tasks using a simple DSL.

This enables:

- Delayed background jobs
- Time-based workflows
- Periodic tasks (cron jobs)
- Event replays and retries

---

## 🕒 Scheduling a Message

You can schedule a message to be delivered **at a specific date** or **after a delay** using the
provider's `schedule` method. From inside an Interactor, the provider is available as `this.asyncmq`
— the examples below use the standalone `ProgramModule` lookup (see
[Enqueue or Publish a message](../README.md#4-enqueue-or-publish-a-message)) so they work outside a
class too.

### Example: Schedule by Delay

```ts
import { ProgramModule } from '@zanix/server'
import type { ZanixCoreAsyncMQProvider } from 'jsr:@zanix/asyncmq@latest'

const asyncmq = ProgramModule.providers.get<ZanixCoreAsyncMQProvider>('asyncmq')

await asyncmq.schedule(
  'email.send',
  { email: 'user@example.com' },
  {
    delay: 60_000, // 1 minute
    isInternal: true,
  },
)
```

### Example: Schedule by Date

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

### Scheduling Options

| Option       | Type                  | Description                                                            |
| ------------ | --------------------- | ---------------------------------------------------------------------- |
| `date`       | `Date`                | Absolute date when the message should be delivered. Overrides `delay`. |
| `delay`      | `number`              | Delay in milliseconds before delivery (default: `0`).                  |
| `isInternal` | `boolean`             | Resolves the queue using the internal queue path mechanism.            |
| `...options` | `QueueMessageOptions` | Standard queue publishing options (except expiration).                 |

All scheduled messages are **encrypted**, **persisted**, and delivered exactly once at execution
time. A `date`/`delay` that resolves to a moment in the past throws `ApplicationError` — the
resulting expiration must be in the future.

---

## 📅 Cron Jobs (Recurring Tasks)

AsyncMQ supports **cron-based recurring jobs** using a **Domain-Specific Language (DSL)**.

Cron jobs are registered at startup and automatically scheduled by the provider.

### Registering a Cron Job

```ts
import { registerCronJob } from 'jsr:@zanix/asyncmq@latest'

registerCronJob({
  name: 'minuteJob',
  isActive: true,
  customQueue: 'taskQueue',
  args: { foo: 'bar' },
  schedule: '0 */1 * * * *', // every minute
})
```

Like `registerJob` (see [Worker & Task Execution](./worker.md)), a cron job targets a queue either
via `customQueue` (a named AMQP queue, as above) or via `processingQueue` + `handler` (routed
through the `soft`/`moderate`/`intensive` queues).

#### Cron Job Definition

| Field                                         | Type                                                                | Description                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `name`                                        | `string`                                                            | Unique name of the cron job.                                                                                              |
| `isActive`                                    | `boolean`                                                           | Enables or disables the cron job.                                                                                         |
| `customQueue` / `processingQueue` + `handler` | `string` / `ProcessingQueues` + `Job`                               | Target queue — a named AMQP queue, or one of the predefined `soft`/`moderate`/`intensive` queues with a handler function. |
| `args`                                        | `MessageQueue`                                                      | Payload sent to the queue on each execution.                                                                              |
| `schedule`                                    | `` `${string} ${string} ${string} ${string} ${string} ${string}` `` | Cron expression (seconds precision supported).                                                                            |
| `settings`                                    | `Omit<QueueMessageOptions, 'contextId' \| 'isInternal'>`            | Optional queue publishing options.                                                                                        |

A duplicate cron `name` throws `InternalError` at registration time.

### Cron Execution Metadata

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
- Access scheduling metadata
- Implement custom logic for recurring jobs

### Error Handling & Retries

Cron jobs and scheduled messages integrate seamlessly with AsyncMQ's retry system:

- Failed executions follow the same retry rules as normal messages
- Messages may be requeued or routed to DLQ
- `onerror` handlers receive full scheduling metadata

```ts
async onerror(data: unknown, error: unknown, info: ErrorInfo) {
  console.log('Requeued:', info.requeued)
  console.log('Cron job:', info.cron?.name)
}
```

### Use Cases

- Periodic cleanup jobs
- Daily reports
- Subscription renewals
- Scheduled notifications
- Background synchronization
- Deferred workflows

---

## See also

- [Worker & Task Execution](./worker.md) — running cron jobs through the `soft`/`moderate`/
  `intensive` predefined queues, and the internal-vs-external worker distinction.
- [README](../README.md) — package overview, installation, and the basic Subscriber/Interactor flow.
