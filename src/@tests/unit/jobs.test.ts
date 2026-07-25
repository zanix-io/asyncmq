import { assertThrows } from '@std/assert'
import { ProgramModule } from '@zanix/server'
import { registerCronJob } from 'modules/jobs/cron.defs.ts'
import { registerJob } from 'modules/jobs/task.defs.ts'
import { CRONS_METADATA_KEY, JOBS_METADATA_KEY } from 'utils/constants.ts'

console.error = () => {}

Deno.test('registerJob: throws when a job with the same name is already registered', () => {
  try {
    registerJob({ name: 'dup-job', customQueue: 'dup-job-queue' })

    assertThrows(
      () => registerJob({ name: 'dup-job', customQueue: 'dup-job-queue' }),
      Error,
      'Job registration failed: A job with the name "dup-job" is already registered.',
    )
  } finally {
    ProgramModule.registry.delete(JOBS_METADATA_KEY)
  }
})

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
