/**
 *  ______               _
 * |___  /              (_)
 *    / /   __ _  _ __   _ __  __
 *   / /   / _` || '_ \ | |\ \/ /
 * ./ /___| (_| || | | || | >  <
 * \_____/ \__,_||_| |_||_|/_/\_\
 */

import { Provider } from '@zanix/server'

import { ZanixCoreWorkerProvider } from './provider.ts'

/** Provider DSL definition */
const registerProvider = () => {
  @Provider('worker')
  class _ZanixWorkerProvider extends ZanixCoreWorkerProvider {}
}

/**
 * Core Worker provider loader for Zanix.
 *
 * This module automatically registers the default worker provider (`_ZanixWorkerProvider`).
 * It uses the `@Provider('worker')` decorator to register the provider
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
const zanixWorkerProvider: void = registerProvider()

export default zanixWorkerProvider
