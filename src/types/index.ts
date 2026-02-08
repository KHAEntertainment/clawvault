// Core types for ClawVault

/**
 * Metadata about a secret (never includes the actual value)
 */
export interface SecretMetadata {
  name: string
  description: string
  provider: string
  environmentVar: string
  createdAt: Date
  updatedAt: Date
  length: number // Only length, never the value
}

/**
 * Options when creating a new secret
 */
export interface SecretOptions {
  description: string
  provider: string
  environmentVar?: string
  required?: boolean
}

/**
 * Gateway service configuration
 */
export interface GatewayConfig {
  restartOnUpdate: boolean
  services: string[]
}

/**
 * Main configuration file structure
 */
export interface Config {
  version: number
  secrets: Record<string, SecretDefinition>
  gateway: GatewayConfig
}

/**
 * Individual secret definition from config
 */
export interface SecretDefinition {
  description: string
  environmentVar: string
  provider: string
  required: boolean
  gateways: string[]
  rotation?: RotationOptions
  validation?: ValidationOptions
}

/**
 * Secret rotation configuration
 */
export interface RotationOptions {
  enabled: boolean
  intervalDays: number
}

/**
 * Secret validation rules
 */
export interface ValidationOptions {
  pattern?: RegExp
  minLength?: number
  maxLength?: number
}
