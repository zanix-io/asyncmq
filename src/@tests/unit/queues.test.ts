import type { ZanixCacheProvider, ZanixKVConnector } from '@zanix/server'

import { assert, assertEquals, assertFalse } from '@std/assert'
import {
  getStoragedQueueOptions,
  lockMessage,
  storageQueueOptions,
  unlockMessage,
} from 'utils/queues.ts'
import { CACHE_KEYS } from 'utils/constants.ts'

console.warn = () => {}

// deno-lint-ignore no-explicit-any
const mockStorage = (): { cache: any; kvLocal: any; local: Map<string, unknown> } => {
  const local = new Map<string, unknown>()
  const redis = new Map<string, unknown>()

  return {
    local,
    kvLocal: {
      get: (key: string) => local.get(key),
      set: (key: string, value: unknown) => local.set(key, value),
    },
    cache: {
      local: {
        has: (key: string) => local.has(key),
        set: (key: string, value: unknown) => local.set(key, value),
        delete: (key: string) => local.delete(key),
      },
      redis: {
        has: (key: string) => Promise.resolve(redis.has(key)),
        set: (key: string, value: unknown) => {
          redis.set(key, value)
          return Promise.resolve()
        },
        get: (key: string) => Promise.resolve(redis.get(key)),
        delete: (key: string) => {
          redis.delete(key)
          return Promise.resolve()
        },
      },
    },
  }
}

Deno.test({
  name: 'storageQueueOptions/getStoragedQueueOptions: uses local KV when REDIS_URI is not set',
  fn: async () => {
    Deno.env.delete('REDIS_URI')
    const { cache, kvLocal } = mockStorage()

    await storageQueueOptions('opts-key', { a: 1 }, {
      cache: cache as ZanixCacheProvider,
      kvLocal: kvLocal as ZanixKVConnector,
    })

    const stored = getStoragedQueueOptions('opts-key', {
      cache: cache as ZanixCacheProvider,
      kvLocal: kvLocal as ZanixKVConnector,
    })

    assertEquals(stored, { a: 1 })
  },
})

Deno.test({
  name: 'storageQueueOptions/getStoragedQueueOptions: uses redis when REDIS_URI is set',
  fn: async () => {
    Deno.env.set('REDIS_URI', 'redis://localhost:6379')
    try {
      const { cache, kvLocal } = mockStorage()

      await storageQueueOptions('opts-key', { b: 2 }, {
        cache: cache as ZanixCacheProvider,
        kvLocal: kvLocal as ZanixKVConnector,
      })

      const stored = await getStoragedQueueOptions('opts-key', {
        cache: cache as ZanixCacheProvider,
        kvLocal: kvLocal as ZanixKVConnector,
      })

      assertEquals(stored, { b: 2 })
    } finally {
      Deno.env.delete('REDIS_URI')
    }
  },
})

Deno.test('getStoragedQueueOptions: defaults to {} when nothing was stored', () => {
  Deno.env.delete('REDIS_URI')
  const { cache, kvLocal } = mockStorage()

  const stored = getStoragedQueueOptions('missing-key', {
    cache: cache as ZanixCacheProvider,
    kvLocal: kvLocal as ZanixKVConnector,
  })

  assertEquals(stored, {})
})

Deno.test({
  name:
    'lockMessage/unlockMessage: acquires and releases a lock using only local cache (no REDIS_URI)',
  fn: async () => {
    Deno.env.delete('REDIS_URI')
    const { cache } = mockStorage()

    assert(await lockMessage('msg-1', cache as ZanixCacheProvider))
    assertFalse(await lockMessage('msg-1', cache as ZanixCacheProvider))

    await unlockMessage('msg-1', cache as ZanixCacheProvider)

    assert(await lockMessage('msg-1', cache as ZanixCacheProvider))
  },
})

Deno.test('lockMessage/unlockMessage: also checks/writes redis when REDIS_URI is set', async () => {
  Deno.env.set('REDIS_URI', 'redis://localhost:6379')
  try {
    const { cache } = mockStorage()

    assert(await lockMessage('msg-2', cache as ZanixCacheProvider))
    assertFalse(await lockMessage('msg-2', cache as ZanixCacheProvider))

    await unlockMessage('msg-2', cache as ZanixCacheProvider)

    assert(await lockMessage('msg-2', cache as ZanixCacheProvider))
  } finally {
    Deno.env.delete('REDIS_URI')
  }
})

Deno.test({
  name: 'lockMessage: returns false when already locked only in redis (local miss, redis hit)',
  fn: async () => {
    Deno.env.set('REDIS_URI', 'redis://localhost:6379')
    try {
      const { cache } = mockStorage()

      // Simulate a lock held by another (local) process: present in redis, absent locally.
      // deno-lint-ignore no-explicit-any
      await (cache as any).redis.set(`${CACHE_KEYS.job}:msg-3`, 'running')

      assertFalse(await lockMessage('msg-3', cache as ZanixCacheProvider))
    } finally {
      Deno.env.delete('REDIS_URI')
    }
  },
})
