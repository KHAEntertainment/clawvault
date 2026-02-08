/**
 * End-to-End Tests for ClawVault
 *
 * These tests verify the complete workflow from secret storage
 * through gateway injection to ensure the system works as intended.
 *
 * SECURITY TESTS: Verify that secret values NEVER leak into:
 * - Error messages
 * - Logs
 * - API responses
 * - CLI output
 */

import { createStorage } from '../../src/storage/index'
import { loadConfig, ConfigSchema } from '../../src/config/index'
import { injectToGateway } from '../../src/gateway/index'

/**
 * Helper class to capture console output for leak detection
 */
class ConsoleCapture {
  private logs: string[] = []
  private errors: string[] = []
  private warns: string[] = []

  constructor() {
    this.logs = []
    this.errors = []
    this.warns = []
  }

  capture() {
    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn

    console.log = (...args: any[]) => {
      this.logs.push(args.join(' '))
      originalLog.apply(console, args)
    }

    console.error = (...args: any[]) => {
      this.errors.push(args.join(' '))
      originalError.apply(console, args)
    }

    console.warn = (...args: any[]) => {
      this.warns.push(args.join(' '))
      originalWarn.apply(console, args)
    }

    return () => {
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
    }
  }

  getLogs(): string[] {
    return [...this.logs]
  }

  getErrors(): string[] {
    return [...this.errors]
  }

  getWarns(): string[] {
    return [...this.warns]
  }

  getCombined(): string[] {
    return [...this.logs, ...this.errors, ...this.warns]
  }

  reset() {
    this.logs = []
    this.errors = []
    this.warns = []
  }
}

/**
 * Test secret value patterns that should NEVER appear in logs
 */
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{48}/, // OpenAI API key format
  /sk-ant-[a-zA-Z0-9_-]{95}/, // Anthropic API key format
  /Bearer\s+[a-zA-Z0-9_-]+/, // Bearer tokens
  /password["\s:=]+[a-zA-Z0-9]{20,}/, // Password in logs
]

describe('End-to-End Tests', () => {
  const testSecretName = 'TEST_E2E_SECRET'
  const testSecretValue = 'test-secret-value-12345'

  // Use a test-specific storage provider
  let storage: Awaited<ReturnType<typeof createStorage>>
  let consoleCapture: ConsoleCapture

  beforeAll(async () => {
    storage = await createStorage()
    consoleCapture = new ConsoleCapture()
  })

  beforeEach(() => {
    consoleCapture.reset()
  })

  afterEach(async () => {
    // Clean up test secret
    try {
      await storage.delete(testSecretName)
    } catch {
      // Ignore if not exists
    }
  })

  describe('Secret Storage Workflow', () => {
    it('should store and retrieve a secret', async () => {
      await storage.set(testSecretName, testSecretValue)

      const retrieved = await storage.get(testSecretName)
      expect(retrieved).toBe(testSecretValue)
    })

    it('should list stored secrets', async () => {
      await storage.set(testSecretName, testSecretValue)

      const secrets = await storage.list()
      expect(secrets).toContain(testSecretName)
    })

    it('should check secret existence', async () => {
      expect(await storage.has(testSecretName)).toBe(false)

      await storage.set(testSecretName, testSecretValue)
      expect(await storage.has(testSecretName)).toBe(true)
    })

    it('should delete a secret', async () => {
      await storage.set(testSecretName, testSecretValue)
      expect(await storage.has(testSecretName)).toBe(true)

      await storage.delete(testSecretName)
      expect(await storage.has(testSecretName)).toBe(false)
    })
  })

  describe('Security: No Secret Leakage', () => {
    it('should not log secret values during storage', async () => {
      const uncapture = consoleCapture.capture()

      await storage.set(testSecretName, testSecretValue)

      uncapture()

      const allOutput = consoleCapture.getCombined().join(' ')
      expect(allOutput).not.toContain(testSecretValue)
    })

    it('should not log secret values during retrieval', async () => {
      await storage.set(testSecretName, testSecretValue)

      const uncapture = consoleCapture.capture()

      await storage.get(testSecretName)

      uncapture()

      const allOutput = consoleCapture.getCombined().join(' ')
      expect(allOutput).not.toContain(testSecretValue)
    })

    it('should not expose secret values in error messages', async () => {
      // Try to set an invalid secret (might cause errors in some providers)
      const uncapture = consoleCapture.capture()

      try {
        await storage.set('', 'invalid-name')
      } catch {
        // Expected to fail
      }

      uncapture()

      const allOutput = consoleCapture.getCombined().join(' ')
      expect(allOutput).not.toContain('invalid-name')
    })

    it('should not expose secret patterns in any output', async () => {
      // Test with various secret formats
      const testSecrets = [
        'sk-1234567890abcdef1234567890abcdef1234567890abcdef',
        'sk-ant-api1234567890abcdefghijklmnopqrstuvwxyz1234567890',
      ]

      const uncapture = consoleCapture.capture()

      for (const secret of testSecrets) {
        try {
          await storage.set(`TEST_${secret.slice(0, 8)}`, secret)
          await storage.get(`TEST_${secret.slice(0, 8)}`)
        } catch {
          // Ignore errors
        }
      }

      uncapture()

      const allOutput = consoleCapture.getCombined().join(' ')

      // Check that no secret patterns appear in output
      for (const pattern of SECRET_PATTERNS) {
        expect(allOutput).not.toMatch(pattern)
      }
    })
  })

  describe('Configuration Integration', () => {
    it('should load configuration successfully', async () => {
      const config = await loadConfig()

      expect(config).toHaveProperty('version')
      expect(config).toHaveProperty('secrets')
      expect(config).toHaveProperty('gateway')
      expect(config.version).toBe(1)
    })

    it('should have default secret templates', async () => {
      const config = await loadConfig()

      // Check for expected default secrets
      expect(config.secrets).toHaveProperty('OPENAI_API_KEY')
      expect(config.secrets).toHaveProperty('ANTHROPIC_API_KEY')

      // Verify structure
      const openaiKey = config.secrets.OPENAI_API_KEY
      expect(openaiKey).toHaveProperty('description')
      expect(openaiKey).toHaveProperty('environmentVar')
      expect(openaiKey).toHaveProperty('provider')
      expect(openaiKey).toHaveProperty('required')
      expect(openaiKey).toHaveProperty('gateways')
    })

    it('should validate secret names in config', async () => {
      const config = await loadConfig()

      // All secret names should match the pattern
      const { SECRET_NAME_PATTERN } = await import('../../src/config/schemas')

      for (const name of Object.keys(config.secrets)) {
        expect(SECRET_NAME_PATTERN.test(name)).toBe(true)
      }
    })
  })

  describe('Gateway Injection Workflow', () => {
    it('should prepare secrets for injection', async () => {
      const config = await loadConfig()

      // Set up test secrets
      await storage.set(testSecretName, testSecretValue)

      // Add test secret to config
      config.secrets[testSecretName] = {
        description: 'Test secret for E2E',
        environmentVar: testSecretName,
        provider: 'test',
        required: false,
        gateways: ['main']
      }

      // Test injection (skip restart for testing)
      const result = await injectToGateway(storage, config, {
        skipRestart: true
      })

      expect(result).toHaveProperty('injected')
      expect(result).toHaveProperty('skipped')
      expect(result).toHaveProperty('totalCount')
    })

    it('should not expose secrets during injection', async () => {
      const config = await loadConfig()

      await storage.set(testSecretName, testSecretValue)

      config.secrets[testSecretName] = {
        description: 'Test secret',
        environmentVar: testSecretName,
        provider: 'test',
        required: false,
        gateways: ['main']
      }

      const uncapture = consoleCapture.capture()

      await injectToGateway(storage, config, {
        skipRestart: true
      })

      uncapture()

      const allOutput = consoleCapture.getCombined().join(' ')
      expect(allOutput).not.toContain(testSecretValue)
    })

    it('should handle missing secrets gracefully', async () => {
      const config = await loadConfig()

      // Don't set the secret value
      config.secrets['MISSING_SECRET'] = {
        description: 'Missing secret',
        environmentVar: 'MISSING_SECRET',
        provider: 'test',
        required: false,
        gateways: ['main']
      }

      const result = await injectToGateway(storage, config, {
        skipRestart: true
      })

      // Should skip the missing secret
      expect(result.skipped).toContain('MISSING_SECRET')
    })
  })

  describe('Complete User Workflow', () => {
    it('should support full secret lifecycle', async () => {
      // 1. Config has the secret definition
      const config = await loadConfig()
      expect(Object.keys(config.secrets).length).toBeGreaterThan(0)

      // 2. Store the secret value
      const secretName = Object.keys(config.secrets)[0]
      await storage.set(secretName, testSecretValue)
      expect(await storage.has(secretName)).toBe(true)

      // 3. List shows the secret
      const secrets = await storage.list()
      expect(secrets).toContain(secretName)

      // 4. Retrieve for gateway injection
      const value = await storage.get(secretName)
      expect(value).toBe(testSecretValue)

      // 5. Delete the secret
      await storage.delete(secretName)
      expect(await storage.has(secretName)).toBe(false)
    })
  })

  describe('Platform Detection', () => {
    it('should detect a platform', async () => {
      const { detectPlatform } = await import('../../src/storage/platform')

      const platform = await detectPlatform()

      expect(platform).toHaveProperty('platform')
      expect(platform).toHaveProperty('hasKeyring')
      expect(platform).toHaveProperty('provider')

      // Provider should be one of the valid options
      expect(['linux', 'macos', 'windows', 'fallback']).toContain(platform.provider)
    })

    it('should indicate keyring availability', async () => {
      const { detectPlatform } = await import('../../src/storage/platform')

      const platform = await detectPlatform()

      // On supported platforms with tools installed, hasKeyring should be true
      // Fallback should have hasKeyring: false
      if (platform.provider === 'fallback') {
        expect(platform.hasKeyring).toBe(false)
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle non-existent secret retrieval gracefully', async () => {
      const value = await storage.get('NON_EXISTENT_SECRET_XYZ')
      expect(value).toBeNull()
    })

    it('should handle deletion of non-existent secret', async () => {
      // Should not throw
      await expect(storage.delete('NON_EXISTENT_SECRET_XYZ')).resolves.not.toThrow()
    })

    it('should provide meaningful error messages without secrets', async () => {
      const uncapture = consoleCapture.capture()

      // Try operations that might fail
      try {
        await storage.get('NON_EXISTENT')
      } catch {
        // Ignore
      }

      uncapture()

      const allOutput = consoleCapture.getCombined().join(' ')

      // Should not contain "NON_EXISTENT" with any value-like content
      expect(allOutput).not.toMatch(/password|secret|token|key["\s:=]+[a-zA-Z0-9]{20,}/)
    })
  })

  describe('Metadata Only Exposure', () => {
    it('should expose only secret names from list()', async () => {
      await storage.set(testSecretName, testSecretValue)

      const secrets = await storage.list()

      // Should contain the name
      expect(secrets).toContain(testSecretName)

      // Should NOT contain the value
      expect(secrets.join(' ')).not.toContain(testSecretValue)
    })

    it('should not expose secret lengths in list output', async () => {
      await storage.set(testSecretName, testSecretValue)

      const secrets = await storage.list()

      // Names only, no length information
      for (const secret of secrets) {
        expect(secret).not.toMatch(/\[.*bytes?\]/)
        expect(secret).not.toMatch(/\d+\s*bytes?/)
      }
    })
  })
})

/**
 * Performance Benchmarks
 *
 * These tests verify that operations complete within reasonable time limits.
 */
describe('Performance Benchmarks', () => {
  let storage: Awaited<ReturnType<typeof createStorage>>

  beforeAll(async () => {
    storage = await createStorage()
  })

  it('should store a secret in under 1 second', async () => {
    const start = Date.now()

    await storage.set('PERF_TEST', 'value')

    const duration = Date.now() - start
    expect(duration).toBeLessThan(1000)

    await storage.delete('PERF_TEST')
  })

  it('should retrieve a secret in under 500ms', async () => {
    await storage.set('PERF_TEST', 'value')

    const start = Date.now()

    await storage.get('PERF_TEST')

    const duration = Date.now() - start
    expect(duration).toBeLessThan(500)

    await storage.delete('PERF_TEST')
  })

  it('should list secrets in under 500ms', async () => {
    const start = Date.now()

    await storage.list()

    const duration = Date.now() - start
    expect(duration).toBeLessThan(500)
  })
})
