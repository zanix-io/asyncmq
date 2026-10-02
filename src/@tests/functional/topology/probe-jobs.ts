// deno-coverage-ignore-file
import { registerCronJob } from 'modules/jobs/cron.defs.ts'

/**
 * The one cron every probe process registers (server and worker alike — each process registers its
 * own copy, the way a real project's `*.defs.ts` is loaded by both). It runs on the `soft` queue,
 * so only the worker executes it; the server only schedules it. The handler reports each run on
 * stdout, which is what the tests read.
 */
registerCronJob({
  name: 'probe-tick',
  isActive: true,
  processingQueue: 'soft',
  // Every 3 s by default; a test that needs the pending message to stay put for a while sets
  // `PROBE_SCHEDULE` (e.g. every minute).
  schedule: (Deno.env.get('PROBE_SCHEDULE') ||
    '*/3 * * * * *') as `${string} ${string} ${string} ${string} ${string} ${string}`,
  handler: async function () {
    await Deno.stdout.write(new TextEncoder().encode(`PROBE_RUN ${Date.now()}\n`))
    // A job slower than the cron's period: its next execution arrives while it is still running.
    const duration = Number(Deno.env.get('PROBE_JOB_MS') || 0)
    if (duration) await new Promise((resolve) => setTimeout(resolve, duration))
    await Deno.stdout.write(new TextEncoder().encode(`PROBE_DONE ${Date.now()}\n`))
  },
})
