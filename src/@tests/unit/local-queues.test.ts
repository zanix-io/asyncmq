import { assertInstanceOf } from '@std/assert'
import { WorkerManager } from '@zanix/workers'
import { intensiveLocalQueue } from 'modules/worker/queues/intensive.ts'
import { softLocalQueue } from 'modules/worker/queues/soft.ts'

Deno.test('intensiveLocalQueue: builds a WorkerManager for the intensive processing queue', () => {
  assertInstanceOf(intensiveLocalQueue(), WorkerManager)
})

Deno.test('softLocalQueue: builds a WorkerManager for the soft processing queue', () => {
  assertInstanceOf(softLocalQueue(), WorkerManager)
})
