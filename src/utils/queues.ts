import type { ZanixCacheProvider, ZanixKVConnector } from '@zanix/server'

import logger from '@zanix/logger'

export async function storageQueueOptions<T>(
  key: string,
  data: T,
  storage: { cache: ZanixCacheProvider; kvLocal: ZanixKVConnector },
) {
  const { kvLocal, cache } = storage
  if (Deno.env.has('REDIS_URI')) {
    await cache.redis.set(key, data)
  } else {
    logger.warn(
      'The queue setup system is currently using the local KV storage backend. ' +
        'For distributed deployments or more reliable persistence, consider enabling Redis by defining the REDIS_URI environment variable.',
      'noSave',
    )
    kvLocal.set(key, data)
  }
}

export function getStoragedQueueOptions<T>(
  key: string,
  storage: { cache: ZanixCacheProvider; kvLocal: ZanixKVConnector },
): T | Promise<T> {
  const { kvLocal, cache } = storage
  return Deno.env.has('REDIS_URI')
    ? cache.redis.get<T>(key).then((resp) => resp || {} as T)
    : kvLocal.get<T>(key) || {} as T
}
