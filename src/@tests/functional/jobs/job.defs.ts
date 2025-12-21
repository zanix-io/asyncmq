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
    if (Deno.env.get('id') !== 'my-intensive-job') return
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
  },
})

registerCronJob({
  name: 'my-handler-cron',
  isActive: true,
  args: { message: 'hello cron soft queue' },
  processingQueue: 'soft',
  handler: async function (args: { message: string }) {
    if (Deno.env.get('id') !== 'my-handler-cron') return
    // this should not throw
    this.providers.get('cache')['kvLocal']
    this.providers.get('worker')
    this.providers.get('asyncmq')

    await Deno.stdout.write(
      new TextEncoder().encode(`cron-job-finish-response: ${
        args.message +
        ` (${this.context.queue})`
      }`),
    )
  },
  schedule: '*/2 * * * * *',
  settings: {
    correlationId: 'id',
  },
})

@Subscriber({ queue: { topic: 'extra-process-queue', execution: 'extra-process' } })
export class _Subscriber extends ZanixSubscriber {
  protected async onmessage(args: { message: string }) {
    if (Deno.env.get('id') !== 'my-custom-job') return
    await Deno.stdout.write(
      new TextEncoder().encode(`external-job-finish-response: ${args.message}`),
    )
  }
}

registerJob({
  name: 'my-custom-job',
  args: { message: 'hello local custom queue' },
  customQueue: 'extra-process-queue',
})
