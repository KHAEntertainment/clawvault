/**
 * Configuration Loader and Saver
 *
 * Handles loading, saving, and creating the ClawVault configuration file.
 * The config file is stored at ~/.config/clawvault/secrets.json
 *
 * IMPORTANT: This file contains only secret DEFINITIONS (metadata),
 * not actual secret values. Values are stored in the OS keyring.
 */

import { join } from 'path'
import { homedir } from 'os'
import { promises as fs } from 'fs'
import { validateConfig, ConfigSchema } from './schemas.js'
import { getDefaultConfig } from './defaults.js'

/**
 * Path to the ClawVault configuration directory.
 */
export const CONFIG_DIR = join(homedir(), '.config', 'clawvault')

/**
 * Path to the ClawVault configuration file.
 */
export const CONFIG_PATH = join(CONFIG_DIR, 'secrets.json')

/**
 * Error thrown when configuration is invalid.
 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(`Configuration validation failed: ${message}`)
    this.name = 'ConfigValidationError'
  }
}

/**
 * Error thrown when configuration file cannot be read.
 */
export class ConfigReadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(`Failed to read configuration: ${message}`)
    this.name = 'ConfigReadError'
    this.cause = cause
  }
}

/**
 * Error thrown when configuration file cannot be written.
 */
export class ConfigWriteError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(`Failed to write configuration: ${message}`)
    this.name = 'ConfigWriteError'
    this.cause = cause
  }
}

/**
 * Load the ClawVault configuration file.
 *
 * If the configuration file doesn't exist, creates a default one.
 * If the configuration exists but is invalid, throws an error.
 *
 * @returns The parsed and validated configuration
 * @throws ConfigReadError if the file cannot be read
 * @throws ConfigValidationError if the configuration is invalid
 */
export async function loadConfig(): Promise<ConfigSchema> {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(data)

    if (!validateConfig(config)) {
      throw new ConfigValidationError(
        'Configuration format is invalid. Check that all required fields are present.'
      )
    }

    return config
  } catch (error: unknown) {
    // If file doesn't exist, create default config
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return await createDefaultConfig()
    }

    // If it's a validation error, re-throw it
    if (error instanceof ConfigValidationError) {
      throw error
    }

    // Otherwise wrap in ConfigReadError
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new ConfigReadError(message, error)
  }
}

/**
 * Save the ClawVault configuration file.
 *
 * Validates the configuration before saving and creates
 * the config directory if it doesn't exist.
 *
 * @param config - The configuration to save
 * @throws ConfigValidationError if the configuration is invalid
 * @throws ConfigWriteError if the file cannot be written
 */
export async function saveConfig(config: ConfigSchema): Promise<void> {
  // Validate before saving
  if (!validateConfig(config)) {
    throw new ConfigValidationError(
      'Configuration format is invalid. Cannot save invalid configuration.'
    )
  }

  try {
    // Ensure config directory exists
    await fs.mkdir(CONFIG_DIR, { recursive: true })

    // Write with pretty-printing (2-space indent)
    // Use atomic write to avoid readers seeing partially-written JSON.
    const tmpPath = join(CONFIG_DIR, `secrets.json.tmp.${process.pid}.${Date.now()}`)
    await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), {
      encoding: 'utf-8',
      mode: 0o600
    })
    await fs.rename(tmpPath, CONFIG_PATH)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new ConfigWriteError(message, error)
  }
}

/**
 * Create a default configuration file.
 *
 * Called automatically when no configuration exists.
 * Creates the config directory and writes the default config.
 *
 * @returns The default configuration that was created
 */
export async function createDefaultConfig(): Promise<ConfigSchema> {
  const defaults = getDefaultConfig()
  await saveConfig(defaults)
  return defaults
}

/**
 * Check if the configuration file exists.
 *
 * @returns true if the configuration file exists
 */
export async function configExists(): Promise<boolean> {
  try {
    await fs.access(CONFIG_PATH)
    return true
  } catch {
    return false
  }
}

/**
 * Get the configuration file path.
 *
 * Useful for displaying to the user in CLI output.
 *
 * @returns The absolute path to the configuration file
 */
export function getConfigPath(): string {
  return CONFIG_PATH
}

/**
 * Add or update a secret definition in the configuration.
 *
 * @param name - The secret name (must match SECRET_NAME_PATTERN)
 * @param definition - The secret definition
 * @throws ConfigValidationError if the name is invalid
 */
export async function addSecretDefinition(
  name: string,
  definition: ConfigSchema['secrets'][string]
): Promise<void> {
  const { validateSecretName } = await import('./schemas.js')

  if (!validateSecretName(name)) {
    throw new ConfigValidationError(
      `Invalid secret name "${name}". Must match pattern: /^[A-Z][A-Z0-9_]*$/`
    )
  }

  const config = await loadConfig()
  config.secrets[name] = definition
  await saveConfig(config)
}

/**
 * Remove a secret definition from the configuration.
 *
 * @param name - The secret name to remove
 * @returns true if the secret was removed, false if it didn't exist
 */
export async function removeSecretDefinition(name: string): Promise<boolean> {
  const config = await loadConfig()

  if (!(name in config.secrets)) {
    return false
  }

  delete config.secrets[name]
  await saveConfig(config)
  return true
}

/**
 * Get a secret definition from the configuration.
 *
 * @param name - The secret name
 * @returns The secret definition or undefined if not found
 */
export async function getSecretDefinition(
  name: string
): Promise<ConfigSchema['secrets'][string] | undefined> {
  const config = await loadConfig()
  return config.secrets[name]
}

/**
 * Reload the configuration from disk.
 *
 * Useful for long-running processes that need to pick up
 * configuration changes.
 *
 * @returns The newly loaded configuration
 */
export async function reloadConfig(): Promise<ConfigSchema> {
  return await loadConfig()
}

// Re-export types from schemas for convenience
export type { ConfigSchema, SecretDefinitionSchema, ValidationError, ValidationResult } from './schemas.js'
