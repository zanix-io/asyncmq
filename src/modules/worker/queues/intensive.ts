import type { FullProcessingQueue, MessageInfo } from 'typings/queues.ts'
import type { MessageQueue } from '@zanix/server'

import { Subscriber } from 'modules/subscribers/decorators/base.ts'
import { ZanixSubscriber } from 'modules/subscribers/base.ts'
import { WorkerManager } from '@zanix/workers'
import { processor } from './base.ts'

const topic: FullProcessingQueue = 'zanix.worker.intensive'

@Subscriber({
  queue: {
    topic,
    execution: 'extra-process',
    settings: { maxPriority: 'high' },
  },
})
export class IntensiveSubscriber extends ZanixSubscriber {
  public async onmessage(
    { $args, $taskId }: { $args: MessageQueue; $taskId: string },
    { context }: MessageInfo,
  ) {
    await processor({ taskId: $taskId, context, args: $args, queue: topic })
  }
}

export const intensiveLocalQueue = () => new WorkerManager() // just one worker
