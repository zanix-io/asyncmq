/**
 *  ______               _
 * |___  /              (_)
 *    / /   __ _  _ __   _ __  __
 *   / /   / _` || '_ \ | |\ \/ /
 * ./ /___| (_| || | | || | >  <
 * \_____/ \__,_||_| |_||_|/_/\_\
 */

import { ZanixCoreAsyncMQProvider } from './provider/mod.ts'
import { ZanixRabbitMQConnector } from './connector.ts'
import {
  Connector,
  Provider,
  registerCoreConnectorSlot,
  registerCoreProviderSlot,
  ZanixAsyncmqConnector,
  ZanixAsyncMQProvider,
} from '@zanix/server'
import { isInternalProcess } from 'modules/worker/mod.ts'
import { AMQP_URI_ENV } from 'utils/constants.ts'

const startMode = isInternalProcess() ? 'lazy' : 'postBoot'

// `@zanix/asyncmq` owns the `'asyncmq'` provider and connector slots — registered unconditionally
// (unlike `registerConnector` below, which only installs a *concrete* implementation when
// `AMQP_URI` is set). Without `AMQP_URI`, the slot still exists — resolving it then correctly
// fails with "registered but no implementation found", not "missing core slot".
registerCoreConnectorSlot('asyncmq', ZanixAsyncmqConnector, {
  sourcePackage: '@zanix/asyncmq/core',
})
registerCoreProviderSlot('asyncmq', ZanixAsyncMQProvider, {
  sourcePackage: '@zanix/asyncmq/core',
})

/**
 * Connector + Provider DSL definition — exported (not just auto-run below) so a caller can
 * re-register after clearing the `'type:connector'`/`'type:provider'` registries
 * (`ProgramModule.targets.resetContainer(['type:connector', 'type:provider'])`, or
 * `closeAllConnections()` for the connector half, both in `@zanix/server`), without needing a
 * fresh module evaluation of this file. Re-reads `Deno.env` each call, so a config-reload in a
 * long-running process — or a test simulating a different env state between cases — gets a
 * genuinely current registration, not a stale decision baked in at first import. Same pattern
 * `@zanix/datamaster`'s own `storage/core.ts` (`registerS3Connector`) already uses.
 */
export const registerRabbitMQConnector = (): void => {
  if (!Deno.env.has(AMQP_URI_ENV)) return

  @Connector({ slot: 'asyncmq', startMode })
  class _ZanixRabbitMQConnector extends ZanixRabbitMQConnector {
    constructor(contextId?: string) {
      // deno-lint-ignore no-non-null-assertion
      super({ contextId, uri: Deno.env.get(AMQP_URI_ENV)! })
    }
  }

  @Provider({ slot: 'asyncmq', startMode })
  class _ZanixAsyncMQProvider extends ZanixCoreAsyncMQProvider {
    constructor(contextId?: string) {
      super(contextId)
    }
  }
}

/**
 * Core AsyncMQ connector and provider loader for Zanix.
 *
 * This module automatically registers the default AsyncMQ connector and provider
 * (`_ZanixRabbitMQConnector`, `_ZanixAsyncMQProvider`) if the environment variable `AMQP_URI` is set.
 * It uses the `@Connector('asyncmq')` and `@Provider('asyncmq')` decorators to register the connector
 * with the Zanix framework.
 *
 * This behavior ensures that, when a AsyncMQ connection string is provided,
 * a default asyncmq connector and provider is available without requiring manual setup.
 *
 * @requires Deno.env
 * @requires ZanixRabbitMQConnector
 * @requires ZanixCoreAsyncMQProvider
 * @decorator Connector
 *
 * @module
 */
const zanixRabbitMQCore: void = registerRabbitMQConnector()

export default zanixRabbitMQCore
