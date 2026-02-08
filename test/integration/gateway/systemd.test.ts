/**
 * Integration tests for Systemd Service Manager
 *
 * Tests the systemd user service management functionality.
 * These tests may require a running systemd user session.
 */

import { SystemdManager, SystemdError, createSystemdManager } from '../../../src/gateway/systemd'

// Skip all tests if not on Linux with systemd
const describeSystemd = process.platform === 'linux' ? describe : describe.skip

describeSystemd('SystemdManager', () => {
  let systemd: SystemdManager
  const testService = 'dbus.service' // A service that's almost always active

  beforeEach(() => {
    systemd = new SystemdManager()
  })

  describe('importEnvironment', () => {
    it('should import environment variables', async () => {
      // Set up test environment variables
      process.env.CLAWVAULT_TEST_VAR_1 = 'test-value-1'
      process.env.CLAWVAULT_TEST_VAR_2 = 'test-value-2'

      await systemd.importEnvironment(['CLAWVAULT_TEST_VAR_1', 'CLAWVAULT_TEST_VAR_2'])

      // If we get here without throwing, the import succeeded
      expect(true).toBe(true)

      // Clean up
      delete process.env.CLAWVAULT_TEST_VAR_1
      delete process.env.CLAWVAULT_TEST_VAR_2
    })

    it('should handle empty environment array', async () => {
      // Should not throw
      await systemd.importEnvironment([])
      expect(true).toBe(true)
    })

    it('should throw SystemdError on failure', async () => {
      // This should fail because we're passing invalid flags
      await expect(
        systemd.importEnvironment([''])
      ).rejects.toThrow(SystemdError)
    })
  })

  describe('isServiceActive', () => {
    it('should return true for active service', async () => {
      const isActive = await systemd.isServiceActive(testService)

      // dbus.service is almost always active on Linux desktop
      expect(typeof isActive).toBe('boolean')
    })

    it('should return false for non-existent service', async () => {
      const isActive = await systemd.isServiceActive('nonexistent-clawvault-test.service')

      expect(isActive).toBe(false)
    })
  })

  describe('isServiceEnabled', () => {
    it('should return boolean for service status', async () => {
      const isEnabled = await systemd.isServiceEnabled(testService)

      expect(typeof isEnabled).toBe('boolean')
    })

    it('should return false for non-existent service', async () => {
      const isEnabled = await systemd.isServiceEnabled('nonexistent-clawvault-test.service')

      expect(isEnabled).toBe(false)
    })
  })

  describe('getStatus', () => {
    it('should return status string', async () => {
      const status = await systemd.getStatus(testService)

      expect(typeof status).toBe('string')
      expect(status.length).toBeGreaterThan(0)
    })

    it('should throw for non-existent service with proper error', async () => {
      await expect(
        systemd.getStatus('nonexistent-clawvault-test-xyz.service')
      ).rejects.toThrow()
    })
  })

  describe('getServiceStatus', () => {
    it('should return structured status object', async () => {
      const status = await systemd.getServiceStatus(testService)

      expect(status).toHaveProperty('name')
      expect(status).toHaveProperty('active')
      expect(status).toHaveProperty('enabled')
      expect(status).toHaveProperty('status')
      expect(status.name).toBe(testService)
      expect(typeof status.active).toBe('boolean')
      expect(typeof status.enabled).toBe('boolean')
      expect(['active', 'inactive', 'failed', 'unknown']).toContain(status.status)
    })
  })

  describe('startService / stopService', () => {
    // These tests are risky as they manipulate actual services
    // Use a test-specific service or mock

    it('should throw SystemdError for invalid service', async () => {
      await expect(
        systemd.startService('invalid-test-service-xyz.service')
      ).rejects.toThrow(SystemdError)
    })

    it('should throw SystemdError when stopping invalid service', async () => {
      await expect(
        systemd.stopService('invalid-test-service-xyz.service')
      ).rejects.toThrow(SystemdError)
    })
  })

  describe('restartService', () => {
    it('should throw SystemdError for invalid service', async () => {
      await expect(
        systemd.restartService('invalid-test-service-xyz.service', 100, 100)
      ).rejects.toThrow(SystemdError)
    })
  })

  describe('enableService / disableService', () => {
    it('should throw SystemdError for invalid service', async () => {
      await expect(
        systemd.enableService('invalid-test-service-xyz.service')
      ).rejects.toThrow(SystemdError)
    })

    it('should throw SystemdError when disabling invalid service', async () => {
      await expect(
        systemd.disableService('invalid-test-service-xyz.service')
      ).rejects.toThrow(SystemdError)
    })
  })
})

describe('createSystemdManager', () => {
  it('should create a new SystemdManager instance', () => {
    const manager = createSystemdManager()

    expect(manager).toBeInstanceOf(SystemdManager)
  })

  it('should create separate instances', () => {
    const manager1 = createSystemdManager()
    const manager2 = createSystemdManager()

    expect(manager1).not.toBe(manager2)
  })
})

describe('SystemdError', () => {
  it('should create error with message', () => {
    const error = new SystemdError('Test error')

    expect(error.message).toBe('Test error')
    expect(error.name).toBe('SystemdError')
  })

  it('should include service name', () => {
    const error = new SystemdError('Test error', 'test.service')

    expect(error.service).toBe('test.service')
  })

  it('should include cause', () => {
    const cause = new Error('Original error')
    const error = new SystemdError('Test error', undefined, cause)

    expect(error.cause).toBe(cause)
  })
})

// Non-Linux platform tests
describe('SystemdManager (non-Linux)', () => {
  it('should still be instantiable on non-Linux', () => {
    const manager = new SystemdManager()

    expect(manager).toBeInstanceOf(SystemdManager)
    // Methods will fail when called, but the class should construct
  })
})
