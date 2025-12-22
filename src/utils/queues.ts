import type { ZanixCacheProvider, ZanixKVConnector } from '@zanix/server'

import { CACHE_KEYS } from './constants.ts'
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

// Avoid douplicates
export async function lockMessage(
  msgId: string | undefined,
  cache: ZanixCacheProvider,
  exp = 300, // max ttl
): Promise<boolean> {
  const key = `${CACHE_KEYS.job}:${msgId}`
  let isRunning = cache.local.has(key)

  if (isRunning) return false

  const useRedis = Deno.env.has('REDIS_URI')
  if (useRedis) isRunning = await cache.redis.has(key)

  if (isRunning) return false

  cache.local.set(key, 'running', { exp })
  if (useRedis) await cache.redis.set(key, 'running', { exp })

  return true
}

export async function unlockMessage(
  msgId: string | undefined,
  cache: ZanixCacheProvider,
) {
  const key = `${CACHE_KEYS.job}:${msgId}`

  const useRedis = Deno.env.has('REDIS_URI')
  cache.local.delete(key)
  if (useRedis) await cache.redis.delete(key)
}
