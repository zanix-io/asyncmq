import type { FullProcessingQueue, MessageInfo } from 'typings/queues.ts'
import type { MessageQueue } from '@zanix/server'

import { Subscriber } from 'modules/subscribers/decorators/base.ts'
import { ZanixSubscriber } from 'modules/subscribers/base.ts'
import { WorkerManager } from '@zanix/workers'
import { processor } from './base.ts'

const topic: FullProcessingQueue = 'zanix.worker.moderate'

@Subscriber({
  queue: {
    topic,
    execution: 'extra-process',
    settings: {
      channelPrefetch: 2,
      consumerChannels: 2,
      maxPriority: 'high',
    },
  },
})
export class ModerateSubscriber extends ZanixSubscriber {
  public async onmessage(
    { $args, $taskId }: { $args: MessageQueue; $taskId: string },
    { context, attempt }: MessageInfo,
  ) {
    await processor({ taskId: $taskId, attempt, context, args: $args, queue: topic })
  }
}

export const moderateLocalQueue = () => new WorkerManager({ pool: 2 })
