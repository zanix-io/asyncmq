// deno-lint-ignore-file no-explicit-any
import type { ZanixCacheProvider, ZanixKVConnector } from '@zanix/server'

import { assertEquals } from '@std/assert'
import { project, setup } from 'modules/rabbitmq/provider/setup.ts'
import { SUBSCRIBERS_METADATA_KEY } from 'utils/constants.ts'

// Regression test for a real incident: `SUBSCRIBERS_METADATA_KEY` is a fixed, package-wide
// constant — with no `project` prefix, every service sharing one Redis instance (a common setup
// across a fleet of microservices, e.g. the same Redis Cloud instance for several `AeraTech`
// services) reads and writes the *same* key for its queue-options cache. Whichever service last
// called `setup()` clobbers the others' stored options, so the next service's
// `consumeAllMessages(fullQueuePath, oldOptions)` call (in the "Update Queues" branch below) ends
// up asserting its own, correctly-named queue with a *foreign* `deadLetterRoutingKey` — which
// RabbitMQ rejects with `406 PRECONDITION-FAILED` (`inequivalent arg 'x-dead-letter-routing-key'`),
// even though the queue name itself was correct the whole time.
Deno.test(
  'setup(): namespaces the stored queue-options key by `project` — never a bare, package-wide key shared across every service on the same Redis/kvLocal backend',
  async () => {
    const deletedKeys: string[] = []
    const kvLocal = { delete: (key: string) => deletedKeys.push(key) }
    const cache = {}

    // `subscribers: undefined` takes the early-return branch (`setup.ts`'s first `if`), which is
    // enough to exercise the storage-key computation without needing a real RabbitMQ connector.
    await setup({
      execution: 'main-process',
      connector: {} as any,
      subscribers: undefined,
      kvLocal: kvLocal as unknown as ZanixKVConnector,
      cache: cache as unknown as ZanixCacheProvider,
      secret: 'test-secret',
    })

    const bareKey = SUBSCRIBERS_METADATA_KEY['main-process']
    assertEquals(deletedKeys, [`${project}:${bareKey}`])
  },
)
