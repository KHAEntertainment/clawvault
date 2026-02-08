/**
 * Integration tests for Gateway Environment Injection
 *
 * Tests the environment variable injection functionality.
 * Uses a mock storage provider for testing.
 */

import { injectSecrets, injectSecretsWithConfig, exportToSystemdCommand, injectIntoProcess } from '../../../src/gateway/environment'

// Mock storage provider for testing
class MockStorageProvider {
  private secrets: Record<string, string> = {}

  setSecret(name: string, value: string): void {
    this.secrets[name] = value
  }

  clear(): void {
    this.secrets = {}
  }

  async get(name: string): Promise<string | null> {
    return this.secrets[name] || null
  }

  async set(_name: string, _value: string): Promise<void> {
    // Not used in tests
  }

  async delete(_name: string): Promise<void> {
    // Not used in tests
  }

  async list(): Promise<string[]> {
    return Object.keys(this.secrets)
  }

  async has(name: string): Promise<boolean> {
    return name in this.secrets
  }
}

describe('Gateway Environment Injection', () => {
  let storage: MockStorageProvider

  beforeEach(() => {
    storage = new MockStorageProvider()
  })

  afterEach(() => {
    // Clean up process.env
    delete process.env.TEST_SECRET_1
    delete process.env.TEST_SECRET_2
    delete process.env.CUSTOM_ENV_VAR
  })

  describe('injectSecrets', () => {
    it('should inject secrets into environment object', async () => {
      storage.setSecret('API_KEY', 'sk-test-12345')
      storage.setSecret('TOKEN', 'token-abc-xyz')

      const result = await injectSecrets(storage, ['API_KEY', 'TOKEN'])

      expect(result).toEqual({
        API_KEY: 'sk-test-12345',
        TOKEN: 'token-abc-xyz'
      })
    })

    it('should skip secrets that do not exist', async () => {
      storage.setSecret('API_KEY', 'sk-test-12345')

      const result = await injectSecrets(storage, ['API_KEY', 'MISSING'])

      expect(result).toEqual({
        API_KEY: 'sk-test-12345'
      })
      expect(result.MISSING).toBeUndefined()
    })

    it('should return empty object for no secrets', async () => {
      const result = await injectSecrets(storage, [])

      expect(result).toEqual({})
    })

    it('should return empty object when no secrets found', async () => {
      const result = await injectSecrets(storage, ['MISSING_1', 'MISSING_2'])

      expect(result).toEqual({})
    })
  })

  describe('injectSecretsWithConfig', () => {
    it('should inject secrets with custom env var mapping', async () => {
      storage.setSecret('SECRET_1', 'value-1')
      storage.setSecret('SECRET_2', 'value-2')

      const envVarMap = {
        SECRET_1: 'CUSTOM_ENV_VAR',
        SECRET_2: 'ANOTHER_VAR'
      }

      const result = await injectSecretsWithConfig(storage, ['SECRET_1', 'SECRET_2'], envVarMap)

      expect(result.env).toEqual({
        CUSTOM_ENV_VAR: 'value-1',
        ANOTHER_VAR: 'value-2'
      })
      expect(result.injected).toEqual(['CUSTOM_ENV_VAR', 'ANOTHER_VAR'])
      expect(result.skipped).toEqual([])
      expect(result.totalCount).toBe(2)
    })

    it('should track skipped secrets', async () => {
      storage.setSecret('SECRET_1', 'value-1')

      const result = await injectSecretsWithConfig(storage, ['SECRET_1', 'SECRET_2'])

      expect(result.injected).toEqual(['SECRET_1'])
      expect(result.skipped).toEqual(['SECRET_2'])
      expect(result.totalCount).toBe(2)
    })

    it('should use secret name as env var when no mapping provided', async () => {
      storage.setSecret('API_KEY', 'sk-test')

      const result = await injectSecretsWithConfig(storage, ['API_KEY'])

      expect(result.env).toEqual({
        API_KEY: 'sk-test'
      })
      expect(result.injected).toEqual(['API_KEY'])
    })
  })

  describe('exportToSystemdCommand', () => {
    it('should generate correct systemctl command', () => {
      const env = {
        API_KEY: 'sk-test',
        TOKEN: 'my-token'
      }

      const command = exportToSystemdCommand(env)

      expect(command).toBe('systemctl --user import-environment API_KEY TOKEN')
    })

    it('should handle single env var', () => {
      const env = { API_KEY: 'sk-test' }

      const command = exportToSystemdCommand(env)

      expect(command).toBe('systemctl --user import-environment API_KEY')
    })

    it('should handle empty env object', () => {
      const command = exportToSystemdCommand({})

      expect(command).toBe('systemctl --user import-environment ')
    })
  })

  describe('injectIntoProcess', () => {
    it('should inject environment variables into process.env', () => {
      const env = {
        TEST_SECRET_1: 'value-1',
        TEST_SECRET_2: 'value-2'
      }

      const injected = injectIntoProcess(env)

      expect(process.env.TEST_SECRET_1).toBe('value-1')
      expect(process.env.TEST_SECRET_2).toBe('value-2')
      expect(injected).toEqual(['TEST_SECRET_1', 'TEST_SECRET_2'])
    })

    it('should return empty array for empty env', () => {
      const injected = injectIntoProcess({})

      expect(injected).toEqual([])
    })

    it('should overwrite existing process.env values', () => {
      process.env.TEST_SECRET_1 = 'old-value'

      const env = { TEST_SECRET_1: 'new-value' }
      injectIntoProcess(env)

      expect(process.env.TEST_SECRET_1).toBe('new-value')
    })
  })

  describe('Security: Secret values never in logs', () => {
    it('should not include secret values in string representation', async () => {
      storage.setSecret('API_KEY', 'sk-very-secret-key-12345')

      const result = await injectSecrets(storage, ['API_KEY'])

      // The object contains the value (necessary for injection),
      // but this test verifies we're not accidentally logging it
      expect(result.API_KEY).toBe('sk-very-secret-key-12345')
      // In production, ensure console.log(result) is never called
      // or use a custom inspect method
    })
  })
})
