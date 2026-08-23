import { assertEquals } from '@std/assert'
import { ProgramModule } from '@zanix/server'
import { registerDLQProcessor } from 'modules/jobs/dlq.defs.ts'
import { CRONS_METADATA_KEY } from 'utils/constants.ts'

// deno-lint-ignore no-explicit-any
type CronRegistryEntry = [string, any]

const getRegisteredCronJob = (name: string) => {
  const crons = ProgramModule.registry.get<CronRegistryEntry[]>(CRONS_METADATA_KEY) || []
  return crons.find(([registeredName]) => registeredName === name)?.[1]
}

Deno.test('registerDLQProcessor wires a descriptor into a real cron job', () => {
  try {
    registerDLQProcessor('payment.process', {
      name: 'reprocess-payment',
      schedule: '0,30 * * * * *',
      processingQueue: 'soft',
      handler: () => {},
    })

    const cron = getRegisteredCronJob('dlq:reprocess-payment')
    assertEquals(cron?.schedule, '0,30 * * * * *')
    assertEquals(cron?.isActive, true)
    // `registerCronJob` resolves `processingQueue: 'soft'` into a `queue: 'zanix.worker.soft'`
    // string internally — this confirms the option actually reached the real registration call.
    assertEquals(cron?.queue, 'zanix.worker.soft')
    // The handler itself isn't stored inline — `registerCronJob` registers it as a separate task
    // and stores only its id; a truthy `$taskId` confirms one was registered.
    assertEquals(typeof cron?.args?.$taskId, 'string')
  } finally {
    ProgramModule.registry.delete(CRONS_METADATA_KEY)
  }
})

Deno.test('registerDLQProcessor defaults isActive/processingQueue when omitted', () => {
  try {
    registerDLQProcessor('webhook.deliver', {
      name: 'reprocess-webhook',
      schedule: '0,30 * * * * *',
      handler: () => {},
    })

    const cron = getRegisteredCronJob('dlq:reprocess-webhook')
    assertEquals(cron?.isActive, true)
    assertEquals(cron?.queue, 'zanix.worker.soft')
  } finally {
    ProgramModule.registry.delete(CRONS_METADATA_KEY)
  }
})
