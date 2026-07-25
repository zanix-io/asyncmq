/**
 *  ______               _
 * |___  /              (_)
 *    / /   __ _  _ __   _ __  __
 *   / /   / _` || '_ \ | |\ \/ /
 * ./ /___| (_| || | | || | >  <
 * \_____/ \__,_||_| |_||_|/_/\_\
 *
 * `@zanix/asyncmq/core` — side-effect-only module that auto-registers the default RabbitMQ
 * connector and provider when the `AMQP_URI` environment variable is set. Exports nothing of its
 * own; import it for its registration side effect (see `@zanix/asyncmq`'s README, "Connector
 * Auto-Loading").
 *
 * @module
 */

export * from './rabbitmq/defs.ts'
export * from './worker/defs.ts'
