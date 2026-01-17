import type { FullProcessingQueue, MessageInfo } from 'typings/queues.ts'
import type { MessageQueue } from '@zanix/server'

import { Subscriber } from 'modules/subscribers/decorators/base.ts'
import { ZanixSubscriber } from 'modules/subscribers/base.ts'
import { processor } from './base.ts'
import { WorkerManager } from '@zanix/workers'

const topic: FullProcessingQueue = 'zanix.worker.soft'

@Subscriber({
  queue: {
    topic,
    execution: 'extra-process',
    settings: {
      channelPrefetch: 5,
      maxPriority: 'high',
    },
  },
})
export class SoftSubscriber extends ZanixSubscriber {
  public async onmessage(
    { $args, $taskId }: { $args: MessageQueue; $taskId: string },
    { context }: MessageInfo,
  ) {
    await processor({ taskId: $taskId, context, args: $args, queue: topic })
  }
}

export const softLocalQueue = () => new WorkerManager({ pool: 5 })
