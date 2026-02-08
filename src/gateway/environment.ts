/**
 * Environment Variable Injection for Gateway Integration
 *
 * This module handles injecting secrets into the process environment
 * for systemd user session import. Secrets are retrieved from keyring
 * and mapped to their corresponding environment variable names.
 *
 * SECURITY: Secret values are never logged. Only metadata is logged.
 * The actual secret values go directly from keyring to environment.
 *
 * Reference: reference-secret-manager.sh lines 165-175
 */

import { StorageProvider } from '../storage/index.js'

/**
 * Environment variable mapping for systemd import-environment.
 * Maps environment variable names to their secret values.
 */
export interface EnvironmentInjection {
  [key: string]: string
}

/**
 * Injection result with metadata for logging.
 * Never includes actual secret values.
 */
export interface InjectionResult {
  injected: string[] // Environment variable names that were injected
  skipped: string[] // Secret names that had no value
  totalCount: number
}

/**
 * Inject secrets into the environment for systemd import.
 *
 * Retrieves secret values from the keyring and maps them to
 * their configured environment variable names.
 *
 * @param storage - The storage provider to retrieve secrets from
 * @param secretNames - Array of secret names to inject
 * @returns Object with environment variable names mapped to values
 */
export async function injectSecrets(
  storage: StorageProvider,
  secretNames: string[]
): Promise<EnvironmentInjection> {
  const env: EnvironmentInjection = {}

  for (const name of secretNames) {
    const value = await storage.get(name)
    if (value) {
      // By default, use the secret name as the environment variable name
      // This can be overridden by config lookup in the calling code
      env[name] = value
    }
  }

  return env
}

/**
 * Inject secrets with configuration-aware environment variable mapping.
 *
 * Looks up each secret's configuration to determine the correct
 * environment variable name, then retrieves and maps the value.
 *
 * @param storage - The storage provider to retrieve secrets from
 * @param secretNames - Array of secret names to inject
 * @param envVarMap - Optional map of secret name to environment variable name
 * @returns Injection result with metadata and environment mapping
 */
export async function injectSecretsWithConfig(
  storage: StorageProvider,
  secretNames: string[],
  envVarMap?: Record<string, string>
): Promise<InjectionResult & { env: EnvironmentInjection }> {
  const env: EnvironmentInjection = {}
  const injected: string[] = []
  const skipped: string[] = []

  for (const name of secretNames) {
    let value: string | null

    try {
      value = await storage.get(name)
    } catch {
      throw new Error(`Failed to retrieve secret for injection: ${name}`)
    }

    if (value) {
      // Use mapped env var name or default to secret name
      const envVar = envVarMap?.[name] || name
      env[envVar] = value
      injected.push(envVar)
    } else {
      skipped.push(name)
    }
  }

  return {
    env,
    injected,
    skipped,
    totalCount: secretNames.length
  }
}

/**
 * Generate a systemctl import-environment command string.
 *
 * This is provided for reference - actual execution should be done
 * through the SystemdManager class to handle errors properly.
 *
 * @param env - Environment variable mapping
 * @returns Command string for systemctl import-environment
 */
export function exportToSystemdCommand(env: EnvironmentInjection): string {
  const keys = Object.keys(env).join(' ')
  return `systemctl --user import-environment ${keys}`
}

/**
 * Inject secrets into the current process environment.
 *
 * SECURITY: This should only be called for gateway processes
 * that are designed to handle secrets. Secrets in process
 * environment can be exposed via process inspection.
 *
 * @param env - Environment variable mapping
 * @returns Array of environment variable names that were set
 */
export function injectIntoProcess(env: EnvironmentInjection): string[] {
  const injected: string[] = []

  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value
    injected.push(key)
  }

  return injected
}
