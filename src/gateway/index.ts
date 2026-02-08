/**
 * Gateway Integration Entry Point
 *
 * Main module for injecting secrets into the OpenClaw Gateway.
 * Combines environment injection with systemd service management
 * to propagate secrets from keyring to gateway environment.
 *
 * Reference: reference-secret-manager.sh lines 165-199
 *
 * SECURITY: Secrets are retrieved from keyring and injected directly
 * into gateway environment. They are never logged or exposed to AI context.
 */

import { StorageProvider } from '../storage/index.js'
import { ConfigSchema, SecretDefinitionSchema } from '../config/schemas.js'
import { SystemdManager } from './systemd.js'
import { injectSecretsWithConfig, injectIntoProcess } from './environment.js'

/**
 * Result of gateway injection operation.
 */
export interface GatewayInjectionResult {
  injected: string[] // Environment variable names that were injected
  skipped: string[] // Secret names that had no value
  servicesRestarted: string[] // Services that were restarted
  totalCount: number
}

/**
 * Error thrown when gateway injection fails.
 */
export class GatewayInjectionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'GatewayInjectionError'
  }
}

/**
 * Inject secrets into the OpenClaw Gateway.
 *
 * This is the main entry point for gateway integration. It:
 * 1. Loads the configuration to get secret definitions
 * 2. Retrieves secret values from keyring storage
 * 3. Maps secrets to their environment variable names
 * 4. Imports environment variables to systemd user session
 * 5. Optionally restarts configured gateway services
 *
 * @param storage - The storage provider to retrieve secrets from
 * @param config - The configuration with secret definitions
 * @param options - Optional injection options
 * @returns Result of the injection operation
 * @throws GatewayInjectionError if injection fails
 */
export async function injectToGateway(
  storage: StorageProvider,
  config: ConfigSchema,
  options?: {
    skipRestart?: boolean
    restartDelay?: number
  }
): Promise<GatewayInjectionResult> {
  const systemd = new SystemdManager()
  const servicesRestarted: string[] = []

  // Build environment variable mapping from config
  const envVarMap: Record<string, string> = {}
  const secretNames: string[] = []

  for (const [name, definition] of Object.entries(config.secrets)) {
    const def = definition as SecretDefinitionSchema
    envVarMap[name] = def.environmentVar
    secretNames.push(name)
  }

  // Inject secrets with config-aware environment variable mapping
  const result = await injectSecretsWithConfig(storage, secretNames, envVarMap)

  // Import environment to systemd user session
  if (result.injected.length > 0) {
    await systemd.importEnvironment(result.injected)

    // Also inject into current process environment
    injectIntoProcess(result.env)
  }

  // Restart gateway services if configured
  if (!options?.skipRestart && config.gateway.restartOnUpdate) {
    for (const service of config.gateway.services) {
      try {
        await systemd.restartService(service, options?.restartDelay)
        servicesRestarted.push(service)
      } catch (error: unknown) {
        throw new GatewayInjectionError(
          `Failed to restart gateway service: ${service}`,
          error
        )
      }
    }
  }

  return {
    injected: result.injected,
    skipped: result.skipped,
    servicesRestarted,
    totalCount: result.totalCount
  }
}

/**
 * Inject a single secret into the gateway environment.
 *
 * Convenience method for injecting a single secret without
 * loading the full configuration or restarting services.
 *
 * @param storage - The storage provider to retrieve the secret from
 * @param secretName - Name of the secret to inject
 * @param envVarName - Environment variable name (defaults to secretName)
 * @param systemd - Optional SystemdManager instance
 * @returns true if the secret was injected, false if not found
 */
export async function injectSingleSecret(
  storage: StorageProvider,
  secretName: string,
  envVarName?: string,
  systemd?: SystemdManager
): Promise<boolean> {
  const value = await storage.get(secretName)

  if (!value) {
    return false
  }

  const envVar = envVarName || secretName
  process.env[envVar] = value

  // Import to systemd if manager provided
  if (systemd) {
    await systemd.importEnvironment([envVar])
  }

  return true
}

/**
 * Restart gateway services without injecting new secrets.
 *
 * Useful when you want to restart the gateway but the secrets
 * are already in the environment.
 *
 * @param config - The configuration with service definitions
 * @param systemd - Optional SystemdManager instance
 * @returns Names of services that were restarted
 * @throws GatewayInjectionError if restart fails
 */
export async function restartGatewayServices(
  config: ConfigSchema,
  systemd?: SystemdManager
): Promise<string[]> {
  const manager = systemd || new SystemdManager()
  const restarted: string[] = []

  for (const service of config.gateway.services) {
    try {
      await manager.restartService(service)
      restarted.push(service)
    } catch (error: unknown) {
      throw new GatewayInjectionError(
        `Failed to restart gateway service: ${service}`,
        error
      )
    }
  }

  return restarted
}

/**
 * Check if gateway services are active.
 *
 * @param config - The configuration with service definitions
 * @param systemd - Optional SystemdManager instance
 * @returns Map of service name to active status
 */
export async function checkGatewayServices(
  config: ConfigSchema,
  systemd?: SystemdManager
): Promise<Record<string, boolean>> {
  const manager = systemd || new SystemdManager()
  const status: Record<string, boolean> = {}

  for (const service of config.gateway.services) {
    status[service] = await manager.isServiceActive(service)
  }

  return status
}

/**
 * Get detailed status of all gateway services.
 *
 * @param config - The configuration with service definitions
 * @param systemd - Optional SystemdManager instance
 * @returns Array of service status objects
 */
export async function getGatewayServiceStatuses(
  config: ConfigSchema,
  systemd?: SystemdManager
): Promise<Array<{ name: string; active: boolean; enabled: boolean }>> {
  const manager = systemd || new SystemdManager()
  const statuses: Array<{ name: string; active: boolean; enabled: boolean }> =
    []

  for (const service of config.gateway.services) {
    const status = await manager.getServiceStatus(service)
    statuses.push({
      name: service,
      active: status.active,
      enabled: status.enabled
    })
  }

  return statuses
}

// Re-export types and functions for convenience
export type { EnvironmentInjection, InjectionResult } from './environment.js'
export {
  injectSecrets,
  injectSecretsWithConfig,
  injectIntoProcess,
  exportToSystemdCommand
} from './environment.js'

export type { GatewayService, ServiceStatus } from './systemd.js'
export {
  SystemdManager,
  SystemdError,
  createSystemdManager
} from './systemd.js'
