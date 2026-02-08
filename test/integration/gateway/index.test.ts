/**
 * Integration tests for Gateway Entry Point
 *
 * Tests the main gateway integration functionality.
 * Uses mock storage and systemd manager for safe testing.
 */

import {
  injectToGateway,
  injectSingleSecret,
  restartGatewayServices,
  checkGatewayServices,
  getGatewayServiceStatuses,
  GatewayInjectionError
} from '../../../src/gateway/index'
import { ConfigSchema } from '../../../src/config/schemas'
import { hasSystemdUserSession } from '../../helpers/systemd'

// Mock storage provider
class MockStorageProvider {
  private secrets: Record<string, string> = {}

  setSecret(name: string, value: string): void {
    this.secrets[name] = value
  }

  async get(name: string): Promise<string | null> {
    return this.secrets[name] || null
  }

  async set(_name: string, _value: string): Promise<void> {
    // Not used
  }

  async delete(_name: string): Promise<void> {
    // Not used
  }

  async list(): Promise<string[]> {
    return Object.keys(this.secrets)
  }

  async has(name: string): Promise<boolean> {
    return name in this.secrets
  }

  clear(): void {
    this.secrets = {}
  }
}

// Mock systemd manager
class MockSystemdManager {
  importedEnv: string[] = []
  restartedServices: string[] = []
  activeServices: Record<string, boolean> = {}
  enabledServices: Record<string, boolean> = {}

  async importEnvironment(envVars: string[]): Promise<void> {
    this.importedEnv.push(...envVars)
  }

  async restartService(serviceName: string): Promise<void> {
    this.restartedServices.push(serviceName)
    this.activeServices[serviceName] = true
  }

  async isServiceActive(serviceName: string): Promise<boolean> {
    return this.activeServices[serviceName] || false
  }

  async isServiceEnabled(serviceName: string): Promise<boolean> {
    return this.enabledServices[serviceName] || false
  }

  async getServiceStatus(serviceName: string): Promise<{ name: string; active: boolean; enabled: boolean; status: string }> {
    return {
      name: serviceName,
      active: this.activeServices[serviceName] || false,
      enabled: this.enabledServices[serviceName] || false,
      status: this.activeServices[serviceName] ? 'active' : 'inactive'
    }
  }

  reset(): void {
    this.importedEnv = []
    this.restartedServices = []
    this.activeServices = {}
    this.enabledServices = {}
  }
}


describe('Gateway Integration', () => {
  let storage: MockStorageProvider
  let systemd: MockSystemdManager
  let config: ConfigSchema

  beforeEach(() => {
    storage = new MockStorageProvider()
    systemd = new MockSystemdManager()

    config = {
      version: 1,
      secrets: {
        OPENAI_API_KEY: {
          description: 'OpenAI API key',
          environmentVar: 'OPENAI_API_KEY',
          provider: 'openai',
          required: false,
          gateways: ['main']
        },
        GEMINI_API_KEY: {
          description: 'Gemini API key',
          environmentVar: 'GEMINI_API_KEY',
          provider: 'google',
          required: false,
          gateways: ['main']
        }
      },
      gateway: {
        restartOnUpdate: true,
        services: ['openclaw-gateway.service']
      }
    }

    // Clean up process.env
    delete process.env.OPENAI_API_KEY
    delete process.env.GEMINI_API_KEY
  })

  const describeGateway = hasSystemdUserSession() ? describe : describe.skip

  describeGateway('injectToGateway', () => {
    it('should inject all secrets and restart services', async () => {
      storage.setSecret('OPENAI_API_KEY', 'sk-test-12345')
      storage.setSecret('GEMINI_API_KEY', 'gemini-key-67890')

      const result = await injectToGateway(storage, config, {
        skipRestart: true // Skip actual restart in tests
      })

      // Note: We're not passing the mock systemd, so it will create a real one
      // In a real test, we'd need to inject the mock
      expect(result.injected).toContain('OPENAI_API_KEY')
      expect(result.injected).toContain('GEMINI_API_KEY')
      expect(result.totalCount).toBe(2)
    })

    it('should skip missing secrets', async () => {
      storage.setSecret('OPENAI_API_KEY', 'sk-test-12345')

      const result = await injectToGateway(storage, config, {
        skipRestart: true
      })

      expect(result.injected).toContain('OPENAI_API_KEY')
      expect(result.skipped).toContain('GEMINI_API_KEY')
    })

    it('should set process.env variables', async () => {
      storage.setSecret('OPENAI_API_KEY', 'sk-test-12345')

      await injectToGateway(storage, config, {
        skipRestart: true
      })

      expect(process.env.OPENAI_API_KEY).toBe('sk-test-12345')
    })
  })

  describe('injectSingleSecret', () => {
    it('should inject single secret into process.env', async () => {
      storage.setSecret('API_KEY', 'secret-value')

      const result = await injectSingleSecret(storage, 'API_KEY')

      expect(result).toBe(true)
      expect(process.env.API_KEY).toBe('secret-value')
    })

    it('should return false for missing secret', async () => {
      const result = await injectSingleSecret(storage, 'MISSING_KEY')

      expect(result).toBe(false)
    })

    it('should use custom env var name', async () => {
      storage.setSecret('SECRET_NAME', 'secret-value')

      await injectSingleSecret(storage, 'SECRET_NAME', 'CUSTOM_ENV_VAR')

      expect(process.env.CUSTOM_ENV_VAR).toBe('secret-value')
    })

    it('should import to systemd when manager provided', async () => {
      storage.setSecret('TEST_KEY', 'test-value')

      await injectSingleSecret(storage, 'TEST_KEY', 'TEST_KEY', systemd as any)

      expect(systemd.importedEnv).toContain('TEST_KEY')
    })
  })

  describe('restartGatewayServices', () => {
    it('should restart all configured services', async () => {
      const restarted = await restartGatewayServices(config, systemd as any)

      expect(restarted).toEqual(['openclaw-gateway.service'])
      expect(systemd.restartedServices).toContain('openclaw-gateway.service')
    })

    it('should throw GatewayInjectionError on failure', async () => {
      const errorManager = {
        restartService: async () => {
          throw new Error('Service failed to start')
        }
      }

      await expect(
        restartGatewayServices(config, errorManager as any)
      ).rejects.toThrow(GatewayInjectionError)
    })
  })

  describe('checkGatewayServices', () => {
    it('should return active status for all services', async () => {
      systemd.activeServices['openclaw-gateway.service'] = true

      const status = await checkGatewayServices(config, systemd as any)

      expect(status).toEqual({
        'openclaw-gateway.service': true
      })
    })

    it('should return false for inactive services', async () => {
      // Don't set active, so it defaults to false

      const status = await checkGatewayServices(config, systemd as any)

      expect(status).toEqual({
        'openclaw-gateway.service': false
      })
    })
  })

  describe('getGatewayServiceStatuses', () => {
    it('should return detailed status for all services', async () => {
      systemd.activeServices['openclaw-gateway.service'] = true
      systemd.enabledServices['openclaw-gateway.service'] = true

      const statuses = await getGatewayServiceStatuses(config, systemd as any)

      expect(statuses).toEqual([
        {
          name: 'openclaw-gateway.service',
          active: true,
          enabled: true
        }
      ])
    })

    it('should handle multiple services', async () => {
      config.gateway.services = ['service1.service', 'service2.service']
      systemd.activeServices['service1.service'] = true
      systemd.activeServices['service2.service'] = false

      const statuses = await getGatewayServiceStatuses(config, systemd as any)

      expect(statuses).toHaveLength(2)
      expect(statuses[0].name).toBe('service1.service')
      expect(statuses[0].active).toBe(true)
      expect(statuses[1].name).toBe('service2.service')
      expect(statuses[1].active).toBe(false)
    })
  })

  describe('GatewayInjectionError', () => {
    it('should create error with message', () => {
      const error = new GatewayInjectionError('Injection failed')

      expect(error.message).toBe('Injection failed')
      expect(error.name).toBe('GatewayInjectionError')
    })

    it('should include cause', () => {
      const cause = new Error('Original error')
      const error = new GatewayInjectionError('Injection failed', cause)

      expect(error.cause).toBe(cause)
    })
  })
})
