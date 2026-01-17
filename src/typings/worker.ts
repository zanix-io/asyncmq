import type { HandlerContext, MessageQueue } from '@zanix/server'
import type { FullProcessingQueue } from './queues.ts'
import type { Job } from './jobs.ts'

export type TasksRegistry<
  A extends MessageQueue = MessageQueue,
  T = unknown,
> = Record<string, Job<A, T>>

export type ProcessorOptions = {
  taskId: string
  context: HandlerContext & { queue?: string; attempt?: number }
  args: MessageQueue
  queue: FullProcessingQueue
  attempt: number
}
