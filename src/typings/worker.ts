import type { HandlerContext, MessageQueue } from '@zanix/server'
import type { FullProcessingQueue } from './queues.ts'
import type { Job } from './jobs.ts'

export type TasksRegistry<
  A extends MessageQueue = MessageQueue,
  T = unknown,
> = Record<string, Job<A, T>>

/**
 * Options passed to the worker-thread `processor` function to execute a single registered task
 * inside the internal-process worker thread `ZanixCoreWorkerProvider.runTask` spawns.
 */
export type ProcessorOptions = {
  taskId: string
  context: HandlerContext & { queue?: string; attempt?: number }
  args: MessageQueue
  queue: FullProcessingQueue
  attempt?: number
}
