import { registerJob } from 'modules/jobs/task.defs.ts'
import { registerCronJob } from 'modules/jobs/cron.defs.ts'
import { Subscriber } from 'modules/subscribers/decorators/base.ts'
import { ZanixSubscriber } from 'modules/subscribers/base.ts'

registerJob({
  name: 'my-moderate-task',
  args: { message: 'hello local moderate queue' },
  processingQueue: 'moderate',
  handler: function (args: { message: string }) {
    // this should not throw
    this.providers.get('cache')['kvLocal']
    this.providers.get('worker')
    this.providers.get('asyncmq')

    return { message: args.message, context: this.context }
  },
})

registerJob({
  name: 'my-intensive-job',
  args: { message: 'hello local intensive queue' },
  processingQueue: 'intensive',
  handler: async function (args: { message: string }) {
    // this should not throw
    this.providers.get('cache')['kvLocal']
    this.providers.get('worker')
    this.providers.get('asyncmq')

    await Deno.stdout.write(
      new TextEncoder().encode(`job-finish-response: ${
        args.message +
        ` (${this.context.queue})`
      }`),
    )

    setTimeout(() => Deno.exit(0), 100) // await until ack
  },
})

registerCronJob({
  name: 'my-handler-cron',
  isActive: true,
  args: { message: 'hello cron soft queue' },
  processingQueue: 'soft',
  handler: function (args: { message: string }) {
    // this should not throw
    this.providers.get('cache')['kvLocal']
    this.providers.get('worker')
    this.providers.get('asyncmq')

    globalThis['cron-job-finish-response' as never] = args.message +
      ` (${this.context.queue})` as never
  },
  schedule: '*/2 * * * * *',
  settings: {
    correlationId: 'id',
  },
})

@Subscriber({ queue: { topic: 'extra-process-queue', execution: 'extra-process' } })
export class _Subscriber extends ZanixSubscriber {
  protected async onmessage(args: { message: string }) {
    await Deno.stdout.write(
      new TextEncoder().encode(`external-job-finish-response: ${args.message}`),
    )
    setTimeout(() => Deno.exit(0), 300) // await until ack
  }
}

registerJob({
  name: 'my-custom-job',
  args: { message: 'hello local custom queue' },
  customQueue: 'extra-process-queue',
})
