import type { ZanixCacheProvider, ZanixKVConnector } from '@zanix/server'

import { QUEUES_METADATA_KEY } from './constants.ts'
import logger from '@zanix/logger'

export async function storageQueueOptions<T>(
  data: T,
  cache: ZanixCacheProvider,
  kvDb: ZanixKVConnector,
) {
  if (Deno.env.has('REDIS_URI')) {
    await cache.redis.set(QUEUES_METADATA_KEY, data)
  } else {
    logger.warn(
      'The queue setup system is currently using the local KV storage backend. ' +
        'For distributed deployments or more reliable persistence, consider enabling Redis by defining the REDIS_URI environment variable.',
      'noSave',
    )
    kvDb.set(QUEUES_METADATA_KEY, data)
  }
}

export function getStoragedQueueOptions<T>(
  cache: ZanixCacheProvider,
  kvDb: ZanixKVConnector,
): T | Promise<T> {
  return Deno.env.has('REDIS_URI')
    ? cache.redis.get<T>(QUEUES_METADATA_KEY).then((resp) => resp || {} as T)
    : kvDb.get<T>(QUEUES_METADATA_KEY) || {} as T
}
