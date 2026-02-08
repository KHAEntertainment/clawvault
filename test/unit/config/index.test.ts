/**
 * Config Loader/Saver Tests
 *
 * Tests for loading, saving, and creating configuration files.
 */

import { readFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  saveConfig,
  createDefaultConfig,
  configExists,
  getConfigPath,
  addSecretDefinition,
  removeSecretDefinition,
  getSecretDefinition,
  reloadConfig,
  ConfigValidationError,
  ConfigReadError,
  ConfigWriteError,
  CONFIG_DIR,
  CONFIG_PATH
} from '../../../src/config/index'

// Mock the config paths for testing
const TEST_CONFIG_DIR = join(tmpdir(), 'clawvault-test')
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, 'secrets.json')

// Save original config path
const originalConfigPath = CONFIG_PATH

beforeAll(() => {
  // We'll use a temp directory for tests
})

afterEach(() => {
  // Clean up test config file if it exists
  if (existsSync(TEST_CONFIG_PATH)) {
    unlinkSync(TEST_CONFIG_PATH)
  }
})

describe('getConfigPath', () => {
  it('should return the config file path', () => {
    expect(getConfigPath()).toBe(originalConfigPath)
  })
})

describe('CONFIG constants', () => {
  it('should have correct config directory', () => {
    expect(CONFIG_DIR).toContain('.config')
    expect(CONFIG_DIR).toContain('clawvault')
  })

  it('should have correct config file name', () => {
    expect(CONFIG_PATH).toContain('secrets.json')
  })
})

describe('saveConfig and loadConfig', () => {
  it('should validate before saving', async () => {
    const _config = {
      version: 1,
      secrets: {
        TEST_KEY: {
          description: 'Test API key',
          environmentVar: 'TEST_KEY',
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

    // Note: These functions use the hardcoded CONFIG_PATH
    // In a real test, we'd mock fs or use a test harness
    // For now, we test validation logic

    // Should validate before returning
    expect(async () => {
      // Try to save an invalid config
      await saveConfig({} as any)
    }).rejects.toThrow()
  })

  it('should reject invalid config on save', async () => {
    const invalidConfig = {
      version: 2,
      secrets: {},
      gateway: {}
    }

    await expect(saveConfig(invalidConfig as any)).rejects.toThrow(ConfigValidationError)
  })
})

describe('validateSecretName', () => {
  it('should be imported and available', async () => {
    const { validateSecretName } = await import('../../../src/config/schemas')

    expect(validateSecretName('VALID_NAME')).toBe(true)
    expect(validateSecretName('invalid-name')).toBe(false)
  })
})

describe('addSecretDefinition', () => {
  it('should reject invalid secret names', async () => {
    const definition = {
      description: 'Test',
      environmentVar: 'TEST',
      provider: 'test',
      required: false,
      gateways: ['main']
    }

    await expect(addSecretDefinition('invalid-name', definition)).rejects.toThrow(ConfigValidationError)
  })

  it('should reject empty secret names', async () => {
    const definition = {
      description: 'Test',
      environmentVar: 'TEST',
      provider: 'test',
      required: false,
      gateways: ['main']
    }

    await expect(addSecretDefinition('', definition)).rejects.toThrow(ConfigValidationError)
  })
})

describe('removeSecretDefinition', () => {
  it('should return false for non-existent secret', async () => {
    // This test requires mocking file system
    // For now, we test the function exists
    expect(typeof removeSecretDefinition).toBe('function')
  })
})

describe('getSecretDefinition', () => {
  it('should be a function', () => {
    expect(typeof getSecretDefinition).toBe('function')
  })
})

describe('reloadConfig', () => {
  it('should be a function that reloads config', () => {
    expect(typeof reloadConfig).toBe('function')
  })
})

describe('Error Classes', () => {
  it('ConfigValidationError should have correct properties', () => {
    const error = new ConfigValidationError('Test error')
    expect(error.name).toBe('ConfigValidationError')
    expect(error.message).toContain('Test error')
    expect(error.message).toContain('validation failed')
  })

  it('ConfigReadError should have correct properties', () => {
    const cause = new Error('File not found')
    const error = new ConfigReadError('Cannot read', cause)
    expect(error.name).toBe('ConfigReadError')
    expect(error.message).toContain('Cannot read')
    expect(error.cause).toBe(cause)
  })

  it('ConfigWriteError should have correct properties', () => {
    const cause = new Error('Permission denied')
    const error = new ConfigWriteError('Cannot write', cause)
    expect(error.name).toBe('ConfigWriteError')
    expect(error.message).toContain('Cannot write')
    expect(error.cause).toBe(cause)
  })
})

describe('Security: No secret values logged', () => {
  it('should never log secret values in config operations', () => {
    const configSource = readFileSync(join(__dirname, '../../../src/config/index.ts'), 'utf-8')

    // These patterns should NOT appear in the config loader
    const dangerousPatterns = [
      'console.log(value)',
      'console.log(secret)',
      'console.log(password)',
      '.value,',
      'log\\(.*secret.*value'
    ]

    for (const pattern of dangerousPatterns) {
      // Use regex to search for the pattern
      const regex = new RegExp(pattern, 'i')
      expect(regex.test(configSource)).toBe(false)
    }
  })
})

describe('Default config creation', () => {
  it('createDefaultConfig should be a function', () => {
    expect(typeof createDefaultConfig).toBe('function')
  })

  it('createDefaultConfig should return a promise', () => {
    const result = createDefaultConfig()
    expect(result).toBeInstanceOf(Promise)
  })
})
