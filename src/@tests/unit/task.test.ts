import { assertThrows } from '@std/assert'
import { registerJob } from 'modules/jobs/task.defs.ts'
import { JOBS_METADATA_KEY } from 'utils/constants.ts'
import { ProgramModule } from '@zanix/server'

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
