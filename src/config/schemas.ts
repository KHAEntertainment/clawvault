/**
 * Config Validation Schemas
 *
 * Provides validation for ClawVault configuration files.
 * Ensures secret definitions follow proper naming conventions
 * and have required fields.
 */

/**
 * Pattern for valid secret names.
 * Must start with uppercase letter, followed by uppercase letters,
 * numbers, or underscores only. This matches environment variable
 * naming conventions.
 *
 * Examples: OPENAI_API_KEY, DISCORD_BOT_TOKEN, MY_API_KEY_2
 * Invalid: openai_api_key, My-Api-Key, 2API_KEY
 */
export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

/**
 * Schema interface for the full configuration file.
 */
export interface ConfigSchema {
  version: number
  secrets: Record<string, SecretDefinitionSchema>
  gateway: GatewayConfigSchema
}

/**
 * Schema interface for a secret definition.
 */
export interface SecretDefinitionSchema {
  description: string
  environmentVar: string
  provider: string
  required: boolean
  gateways: string[]
  rotation?: RotationSchema
  validation?: ValidationSchema
}

/**
 * Schema interface for gateway configuration.
 */
export interface GatewayConfigSchema {
  restartOnUpdate: boolean
  services: string[]
}

/**
 * Schema interface for rotation options.
 */
export interface RotationSchema {
  enabled: boolean
  maxAgeDays?: number
  intervalDays?: number
}

/**
 * Schema interface for validation options.
 * Pattern is stored as string for JSON serialization.
 */
export interface ValidationSchema {
  pattern?: string
  minLength?: number
  maxLength?: number
}

/**
 * Validation error details.
 */
export interface ValidationError {
  path: string
  message: string
  value?: unknown
}

/**
 * Result of config validation.
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Validates a secret name against the naming pattern.
 *
 * @param name - The secret name to validate
 * @returns true if the name matches the required pattern
 */
export function validateSecretName(name: string): boolean {
  return SECRET_NAME_PATTERN.test(name)
}

/**
 * Validates a secret definition object.
 *
 * @param name - The secret name (for error reporting)
 * @param def - The secret definition to validate
 * @returns ValidationResult with any errors found
 */
function validateSecretDefinition(
  name: string,
  def: unknown
): ValidationResult {
  const errors: ValidationError[] = []

  if (typeof def !== 'object' || def === null) {
    errors.push({
      path: `secrets.${name}`,
      message: 'Secret definition must be an object'
    })
    return { valid: false, errors }
  }

  const secret = def as Record<string, unknown>

  // Validate description
  if (typeof secret.description !== 'string' || secret.description.trim() === '') {
    errors.push({
      path: `secrets.${name}.description`,
      message: 'Description must be a non-empty string'
    })
  }

  // Validate environmentVar
  if (typeof secret.environmentVar !== 'string' || secret.environmentVar.trim() === '') {
    errors.push({
      path: `secrets.${name}.environmentVar`,
      message: 'environmentVar must be a non-empty string'
    })
  }

  // Validate provider
  if (typeof secret.provider !== 'string' || secret.provider.trim() === '') {
    errors.push({
      path: `secrets.${name}.provider`,
      message: 'provider must be a non-empty string'
    })
  }

  // Validate required
  if (typeof secret.required !== 'boolean') {
    errors.push({
      path: `secrets.${name}.required`,
      message: 'required must be a boolean'
    })
  }

  // Validate gateways
  if (!Array.isArray(secret.gateways)) {
    errors.push({
      path: `secrets.${name}.gateways`,
      message: 'gateways must be an array'
    })
  } else if (secret.gateways.length === 0) {
    errors.push({
      path: `secrets.${name}.gateways`,
      message: 'gateways must contain at least one gateway name'
    })
  }

  // Validate rotation (optional)
  if (secret.rotation !== undefined) {
    if (typeof secret.rotation !== 'object' || secret.rotation === null) {
      errors.push({
        path: `secrets.${name}.rotation`,
        message: 'rotation must be an object'
      })
    } else {
      const rotation = secret.rotation as Record<string, unknown>
      if (typeof rotation.enabled !== 'boolean') {
        errors.push({
          path: `secrets.${name}.rotation.enabled`,
          message: 'rotation.enabled must be a boolean'
        })
      }
      if (rotation.maxAgeDays !== undefined && typeof rotation.maxAgeDays !== 'number') {
        errors.push({
          path: `secrets.${name}.rotation.maxAgeDays`,
          message: 'rotation.maxAgeDays must be a number'
        })
      }
      if (rotation.intervalDays !== undefined && typeof rotation.intervalDays !== 'number') {
        errors.push({
          path: `secrets.${name}.rotation.intervalDays`,
          message: 'rotation.intervalDays must be a number'
        })
      }
    }
  }

  // Validate validation (optional)
  if (secret.validation !== undefined) {
    if (typeof secret.validation !== 'object' || secret.validation === null) {
      errors.push({
        path: `secrets.${name}.validation`,
        message: 'validation must be an object'
      })
    } else {
      const validation = secret.validation as Record<string, unknown>
      if (validation.pattern !== undefined && typeof validation.pattern !== 'string') {
        errors.push({
          path: `secrets.${name}.validation.pattern`,
          message: 'validation.pattern must be a string'
        })
      }
      if (validation.minLength !== undefined && typeof validation.minLength !== 'number') {
        errors.push({
          path: `secrets.${name}.validation.minLength`,
          message: 'validation.minLength must be a number'
        })
      }
      if (validation.maxLength !== undefined && typeof validation.maxLength !== 'number') {
        errors.push({
          path: `secrets.${name}.validation.maxLength`,
          message: 'validation.maxLength must be a number'
        })
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validates gateway configuration.
 *
 * @param gateway - The gateway config to validate
 * @returns ValidationResult with any errors found
 */
function validateGatewayConfig(gateway: unknown): ValidationResult {
  const errors: ValidationError[] = []

  if (typeof gateway !== 'object' || gateway === null) {
    errors.push({
      path: 'gateway',
      message: 'Gateway configuration must be an object'
    })
    return { valid: false, errors }
  }

  const gw = gateway as Record<string, unknown>

  // Validate restartOnUpdate
  if (typeof gw.restartOnUpdate !== 'boolean') {
    errors.push({
      path: 'gateway.restartOnUpdate',
      message: 'restartOnUpdate must be a boolean'
    })
  }

  // Validate services
  if (!Array.isArray(gw.services)) {
    errors.push({
      path: 'gateway.services',
      message: 'services must be an array'
    })
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validates a complete configuration object.
 *
 * Performs comprehensive validation of the configuration structure,
 * including secret definitions and gateway settings.
 *
 * @param config - The configuration to validate (unknown type for safety)
 * @returns Type guard indicating if config is valid ConfigSchema
 */
export function validateConfig(config: unknown): config is ConfigSchema {
  const errors: ValidationError[] = []

  // Top-level validation
  if (typeof config !== 'object' || config === null) {
    return false
  }

  const c = config as Record<string, unknown>

  // Validate version
  if (typeof c.version !== 'number') {
    errors.push({
      path: 'version',
      message: 'Version must be a number'
    })
  } else if (c.version !== 1) {
    errors.push({
      path: 'version',
      message: `Unsupported version: ${c.version}. Only version 1 is supported.`,
      value: c.version
    })
  }

  // Validate secrets object
  if (typeof c.secrets !== 'object' || c.secrets === null) {
    errors.push({
      path: 'secrets',
      message: 'Secrets must be an object'
    })
  } else {
    const secrets = c.secrets as Record<string, unknown>

    // Validate each secret definition
    for (const [name, def] of Object.entries(secrets)) {
      // First validate the secret name
      if (!validateSecretName(name)) {
        errors.push({
          path: `secrets.${name}`,
          message: `Invalid secret name "${name}". Must match pattern: ${SECRET_NAME_PATTERN.toString()}`
        })
      } else {
        // Validate the secret definition
        const result = validateSecretDefinition(name, def)
        errors.push(...result.errors)
      }
    }
  }

  // Validate gateway config
  if (c.gateway === undefined) {
    errors.push({
      path: 'gateway',
      message: 'Gateway configuration is required'
    })
  } else {
    const result = validateGatewayConfig(c.gateway)
    errors.push(...result.errors)
  }

  return errors.length === 0
}

/**
 * Validates configuration and returns detailed errors.
 *
 * Use this when you need to show specific validation errors
 * to the user.
 *
 * @param config - The configuration to validate
 * @returns ValidationResult with all validation errors
 */
export function validateConfigDetailed(config: unknown): ValidationResult {
  const errors: ValidationError[] = []

  if (typeof config !== 'object' || config === null) {
    errors.push({
      path: 'root',
      message: 'Configuration must be an object'
    })
    return { valid: false, errors }
  }

  const c = config as Record<string, unknown>

  // Validate version
  if (typeof c.version !== 'number') {
    errors.push({
      path: 'version',
      message: 'Version must be a number'
    })
  } else if (c.version !== 1) {
    errors.push({
      path: 'version',
      message: `Unsupported version: ${c.version}`
    })
  }

  // Validate secrets
  if (typeof c.secrets !== 'object' || c.secrets === null) {
    errors.push({
      path: 'secrets',
      message: 'Secrets must be an object'
    })
  } else {
    const secrets = c.secrets as Record<string, unknown>
    for (const [name, def] of Object.entries(secrets)) {
      if (!validateSecretName(name)) {
        errors.push({
          path: `secrets.${name}`,
          message: `Invalid secret name format`
        })
      }
      const result = validateSecretDefinition(name, def)
      errors.push(...result.errors)
    }
  }

  // Validate gateway
  if (c.gateway !== undefined) {
    const result = validateGatewayConfig(c.gateway)
    errors.push(...result.errors)
  } else {
    errors.push({
      path: 'gateway',
      message: 'Gateway configuration is required'
    })
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
