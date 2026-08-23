import { assertThrows } from '@std/assert'
import { registerCronJob } from 'modules/jobs/cron.defs.ts'
import { CRONS_METADATA_KEY } from 'utils/constants.ts'
import { ProgramModule } from '@zanix/server'

console.error = () => {}

Deno.test('registerCronJob: throws when a cron with the same name is already registered', () => {
  try {
    registerCronJob({
      name: 'dup-cron',
      isActive: true,
      customQueue: 'dup-cron-queue',
      schedule: '0 0 * * * *',
    })

    assertThrows(
      () =>
        registerCronJob({
          name: 'dup-cron',
          isActive: true,
          customQueue: 'dup-cron-queue',
          schedule: '0 0 * * * *',
        }),
      Error,
      'Conflict: A Cron with the same name or identifier ("dup-cron") is already configured in the system.',
    )
  } finally {
    ProgramModule.registry.delete(CRONS_METADATA_KEY)
  }
})
