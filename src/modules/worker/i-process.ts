Deno.env.set('ZANIX_WORKER_EXECUTION', 'internal-process')

import type { ProcessorOptions } from 'typings/worker.ts'
import { processor as baseProcessor } from './queues/base.ts'

// Imports the process configuration file, awaiting its load before continuing
// The `await` is necessary to ensure the Deno environment configuration is fully loaded before execution
await import('./dependencies.ts')

// Exports a new processor function with the provided options, using the base processor as a foundation.
export const processor = (options: ProcessorOptions) => {
  return baseProcessor(options)
}
