/**
 * Config Schema Validation Tests
 *
 * Tests for configuration validation, secret name validation,
 * and schema validation rules.
 */

import {
  SECRET_NAME_PATTERN,
  validateSecretName,
  validateConfig,
  validateConfigDetailed,
  type ConfigSchema
} from '../../../src/config/schemas'

describe('SECRET_NAME_PATTERN', () => {
  it('should accept valid secret names', () => {
    const validNames = [
      'OPENAI_API_KEY',
      'MY_API_KEY',
      'DISCORD_BOT_TOKEN',
      'A',
      'MY_KEY_2',
      'VERY_LONG_SECRET_NAME_WITH_MANY_UNDERSCORES'
    ]

    for (const name of validNames) {
      expect(validateSecretName(name)).toBe(true)
    }
  })

  it('should reject invalid secret names', () => {
    const invalidNames = [
      'openai_api_key',  // lowercase
      'My-Api-Key',      // hyphens
      '2API_KEY',        // starts with number
      '_SECRET_KEY',     // starts with underscore
      'SECRET-KEY',      // hyphen
      'secret',          // lowercase
      '',                // empty string
      'MY KEY',          // spaces
      'MY.KEY',          // dot
      'MY/KEY'           // slash
    ]

    for (const name of invalidNames) {
      expect(validateSecretName(name)).toBe(false)
    }
  })

  it('should match the regex pattern directly', () => {
    expect('OPENAI_API_KEY').toMatch(SECRET_NAME_PATTERN)
    expect('openai_api_key').not.toMatch(SECRET_NAME_PATTERN)
  })
})

describe('validateConfig', () => {
  const validConfig: ConfigSchema = {
    version: 1,
    secrets: {
      OPENAI_API_KEY: {
        description: 'OpenAI API key',
        environmentVar: 'OPENAI_API_KEY',
        provider: 'openai',
        required: false,
        gateways: ['main'],
        validation: {
          pattern: '^sk-',
          minLength: 20
        }
      }
    },
    gateway: {
      restartOnUpdate: true,
      services: ['openclaw-gateway.service']
    }
  }

  it('should accept a valid configuration', () => {
    expect(validateConfig(validConfig)).toBe(true)
  })

  it('should reject null or undefined', () => {
    expect(validateConfig(null)).toBe(false)
    expect(validateConfig(undefined)).toBe(false)
  })

  it('should reject non-object values', () => {
    expect(validateConfig('string')).toBe(false)
    expect(validateConfig(123)).toBe(false)
    expect(validateConfig([])).toBe(false)
  })

  it('should reject invalid version', () => {
    const invalidVersion = { ...validConfig, version: 2 }
    expect(validateConfig(invalidVersion)).toBe(false)

    const missingVersion = { ...validConfig }
    delete (invalidVersion as any).version
    expect(validateConfig(missingVersion as any)).toBe(false)
  })

  it('should reject missing secrets object', () => {
    const noSecrets = { ...validConfig }
    delete (noSecrets as any).secrets
    expect(validateConfig(noSecrets as any)).toBe(false)
  })

  it('should reject invalid secret names', () => {
    const invalidName = {
      ...validConfig,
      secrets: {
        'invalid-name': validConfig.secrets.OPENAI_API_KEY
      }
    }
    expect(validateConfig(invalidName)).toBe(false)
  })

  it('should reject missing gateway config', () => {
    const noGateway = { ...validConfig }
    delete (noGateway as any).gateway
    expect(validateConfig(noGateway as any)).toBe(false)
  })
})

describe('validateConfigDetailed', () => {
  const validConfig: ConfigSchema = {
    version: 1,
    secrets: {
      OPENAI_API_KEY: {
        description: 'OpenAI API key',
        environmentVar: 'OPENAI_API_KEY',
        provider: 'openai',
        required: false,
        gateways: ['main']
      }
    },
    gateway: {
      restartOnUpdate: true,
      services: ['openclaw-gateway.service']
    }
  }

  it('should return valid result for good config', () => {
    const result = validateConfigDetailed(validConfig)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should return detailed errors for invalid config', () => {
    const invalidConfig = {
      version: 2,
      secrets: {
        'invalid-name': {
          description: '',
          environmentVar: '',
          provider: '',
          required: 'not-a-boolean',
          gateways: []
        }
      },
      gateway: {
        restartOnUpdate: 'not-a-boolean',
        services: 'not-an-array'
      }
    }

    const result = validateConfigDetailed(invalidConfig)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)

    // Check that error paths are meaningful
    const paths = result.errors.map(e => e.path)
    expect(paths).toContain('version')
    expect(paths.some(p => p.includes('secrets.invalid-name'))).toBe(true)
  })

  it('should detect missing required fields in secret definition', () => {
    const incompleteSecret = {
      version: 1,
      secrets: {
        MY_SECRET: {
          description: 'Test'
          // Missing other required fields
        }
      },
      gateway: {
        restartOnUpdate: true,
        services: ['test.service']
      }
    }

    const result = validateConfigDetailed(incompleteSecret)
    expect(result.valid).toBe(false)

    const errorPaths = result.errors.map(e => e.path)
    expect(errorPaths.some(p => p.includes('environmentVar'))).toBe(true)
    expect(errorPaths.some(p => p.includes('provider'))).toBe(true)
  })

  it('should validate optional rotation config', () => {
    const withRotation = {
      ...validConfig,
      secrets: {
        ROTATING_SECRET: {
          description: 'A rotating secret',
          environmentVar: 'ROTATING_SECRET',
          provider: 'custom',
          required: false,
          gateways: ['main'],
          rotation: {
            enabled: true,
            maxAgeDays: 90
          }
        }
      }
    }

    const result = validateConfigDetailed(withRotation)
    expect(result.valid).toBe(true)
  })

  it('should reject invalid rotation config', () => {
    const badRotation = {
      ...validConfig,
      secrets: {
        BAD_ROTATION: {
          description: 'Bad rotation',
          environmentVar: 'BAD_ROTATION',
          provider: 'custom',
          required: false,
          gateways: ['main'],
          rotation: {
            enabled: 'not-a-boolean',
            maxAgeDays: 'not-a-number'
          }
        }
      }
    }

    const result = validateConfigDetailed(badRotation)
    expect(result.valid).toBe(false)

    const rotationErrors = result.errors.filter(e => e.path.includes('rotation'))
    expect(rotationErrors.length).toBeGreaterThan(0)
  })

  it('should validate optional validation config', () => {
    const withValidation = {
      ...validConfig,
      secrets: {
        VALIDATED_SECRET: {
          description: 'A validated secret',
          environmentVar: 'VALIDATED_SECRET',
          provider: 'custom',
          required: false,
          gateways: ['main'],
          validation: {
            pattern: '^[A-Z]+$',
            minLength: 10,
            maxLength: 50
          }
        }
      }
    }

    const result = validateConfigDetailed(withValidation)
    expect(result.valid).toBe(true)
  })
})

describe('Secret Definition Validation', () => {
  it('should require non-empty description', () => {
    const config: ConfigSchema = {
      version: 1,
      secrets: {
        BAD_SECRET: {
          description: '   ',
          environmentVar: 'BAD_SECRET',
          provider: 'test',
          required: false,
          gateways: ['main']
        }
      },
      gateway: {
        restartOnUpdate: true,
        services: ['test.service']
      }
    }

    const result = validateConfigDetailed(config)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.path.includes('description'))).toBe(true)
  })

  it('should require non-empty gateways array', () => {
    const config: ConfigSchema = {
      version: 1,
      secrets: {
        NO_GATEWAY: {
          description: 'No gateway',
          environmentVar: 'NO_GATEWAY',
          provider: 'test',
          required: false,
          gateways: []
        }
      },
      gateway: {
        restartOnUpdate: true,
        services: ['test.service']
      }
    }

    const result = validateConfigDetailed(config)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.path.includes('gateways'))).toBe(true)
  })
})
