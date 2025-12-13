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
import { Connector, Provider } from '@zanix/server'

/** Connector DSL definition */
const registerConnector = () => {
  if (!Deno.env.has('AMQP_URI')) return

  @Connector('asyncmq')
  class _ZanixRabbitMQConnector extends ZanixRabbitMQConnector {
    constructor(contextId?: string) {
      // deno-lint-ignore no-non-null-assertion
      super({ contextId, uri: Deno.env.get('AMQP_URI')! })
    }
  }

  @Provider('asyncmq')
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
const zanixRabbitMQCore: void = registerConnector()

export default zanixRabbitMQCore
