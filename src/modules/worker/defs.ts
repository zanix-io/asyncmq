/**
 *  ______               _
 * |___  /              (_)
 *    / /   __ _  _ __   _ __  __
 *   / /   / _` || '_ \ | |\ \/ /
 * ./ /___| (_| || | | || | >  <
 * \_____/ \__,_||_| |_||_|/_/\_\
 */

import { Provider, registerCoreProviderSlot, ZanixWorkerProvider } from '@zanix/server'

import { ZanixCoreWorkerProvider } from './provider.ts'

/**
 * Provider DSL definition — applies the decorator directly to `ZanixCoreWorkerProvider` (calling
 * it as a plain function, not `@Provider(...)` syntax) rather than wrapping it in a throwaway
 * anonymous subclass, so `this.providers.get(ZanixCoreWorkerProvider)` — the class every consumer
 * actually imports — resolves correctly. See `@zanix/auth`'s `providers/core.ts` for the full
 * rationale.
 */
// Exported (not just auto-run below) — kept consistent with every other `core.ts` loader's own
// callable, re-invokable registration function across the Zanix ecosystem (see
// `@zanix/datamaster`'s `storage/core.ts`'s own `registerSeaweedFSConnector` doc for the full
// reasoning that pattern exists for).
export const registerWorkerProvider = (): void => {
  Provider('worker')(ZanixCoreWorkerProvider)
}

// `@zanix/asyncmq` owns the `'worker'` provider slot.
registerCoreProviderSlot('worker', ZanixWorkerProvider, {
  sourcePackage: '@zanix/asyncmq/core',
})

/**
 * Core Worker provider loader for Zanix.
 *
 * This module automatically registers the default worker provider (`ZanixCoreWorkerProvider`).
 * It uses the `Provider('worker')` decorator to register the provider
 * with the Zanix framework.
 *
 * This behavior ensures that a default worker provider is available without requiring manual setup.
 *
 * @requires Deno.env
 * @requires ZanixCoreWorkerProvider
 * @decorator Provider
 *
 * @module
 */
const zanixWorkerProvider: void = registerWorkerProvider()

export default zanixWorkerProvider
