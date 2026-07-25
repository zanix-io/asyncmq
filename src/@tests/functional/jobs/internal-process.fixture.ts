import type { ProcessorOptions } from 'typings/worker.ts'
import { initWorkerEntrypoint, registerInternalProcess } from 'modules/worker/mod.ts'
import { processor as baseProcessor } from 'modules/worker/queues/base.ts'
import { registerJob } from 'modules/jobs/task.defs.ts'

// Test-only stand-in for the internal-process worker-thread bootstrap a real consumer (e.g.
// `@zanix/core`) is responsible for providing via `setTaskerUrl` — asyncmq ships no built-in one.
// Registers only the specific job this test tree's `runTask` case needs, instead of a full
// project-file scan (deliberately skips `job.defs.ts`'s own `@Subscriber` class, unrelated here).

registerInternalProcess()
await initWorkerEntrypoint()

registerJob({
  name: 'my-moderate-task',
  args: { message: 'hello local moderate queue' },
  processingQueue: 'moderate',
  handler: function (args: { message: string }) {
    return { message: args.message, context: this.context }
  },
})

export const processor = (options: ProcessorOptions) => baseProcessor(options)
