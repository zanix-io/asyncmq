import {
  cleanupInitializationsMetadata,
  ProgramModule,
  targetInitializations,
  ZANIX_SERVER_MODULES,
} from '@zanix/server'
import { SUBSCRIBERS_METADATA_KEY } from 'utils/constants.ts'
import { collectFiles, getRootDir } from '@zanix/helpers'
import { join } from '@std/path'

const isInternal = Deno.env.get('ZANIX_WORKER_EXECUTION') === 'internal-process'

let dependenciesLoaded = false

const loadDependencies = async (
  dir = '.',
) => {
  if (dependenciesLoaded) return

  const types = isInternal
    /* avoid all subscribers and handlers */
    ? ZANIX_SERVER_MODULES.filter((type) => type !== '.handler.ts')
    /* accept handlers to allow external subscribers */
    : ZANIX_SERVER_MODULES

  const imports: Promise<unknown>[] = []

  const rootFilePath = `file://${getRootDir()}`
  collectFiles(dir, types, (path) => {
    imports.push(import(join(rootFilePath, path)))
  })

  await Promise.all(imports)

  // Remove unused data
  ProgramModule.registry.delete(SUBSCRIBERS_METADATA_KEY['main-process'])
  if (isInternal) {
    ProgramModule.registry.delete(SUBSCRIBERS_METADATA_KEY['extra-process'])
  }

  dependenciesLoaded = true
}

// Initialize setup
await targetInitializations('onSetup')

// Project dependencies
await loadDependencies()

// AsyncMQ dependencies
import '../core.ts'

// Initialize onBoot
await targetInitializations('onBoot')

// Loading Zanix datamaster core
import '@zanix/datamaster'

// Initialize PostBoot
await targetInitializations('postBoot')

// Cleanup metadata
cleanupInitializationsMetadata()
