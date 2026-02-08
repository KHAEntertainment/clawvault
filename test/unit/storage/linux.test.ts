/**
 * Linux Keyring Provider Tests
 *
 * Tests for the GNOME Keyring storage provider using secret-tool.
 * Mocks exec calls to avoid requiring actual keyring access.
 */

import { LinuxKeyringProvider } from '../../../src/storage/providers/linux'
import { StorageProvider } from '../../../src/storage/interfaces'

// Mock child_process exec
jest.mock('child_process', () => {
  const mockExec = jest.fn()
  return {
    exec: jest.fn((_command, callback) => {
      // Simulate async behavior
      setImmediate(() => {
        const error = mockExec.mock.results[mockExec.mock.results.length - 1]?.value?.error
        callback(error, mockExec.mock.results[mockExec.mock.results.length - 1]?.value?.stdout || '', '')
      })
    })
  }
})

import { exec } from 'child_process'

describe('LinuxKeyringProvider', () => {
  let provider: StorageProvider
  let mockExecImpl: jest.Mock

  beforeEach(() => {
    provider = new LinuxKeyringProvider()
    mockExecImpl = exec as unknown as jest.Mock

    // Clear all mocks before each test
    jest.clearAllMocks()
  })

  describe('set()', () => {
    it('should store a secret using secret-tool', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, '', '')
      })

      await provider.set('OPENAI_API_KEY', 'sk-test-key-12345')

      expect(mockExecImpl).toHaveBeenCalled()
      const cmd = mockExecImpl.mock.calls[0][0] as string
      expect(cmd).toContain('secret-tool store')
      expect(cmd).toContain('service "clawvault"')
      expect(cmd).toContain('key "OPENAI_API_KEY"')
      expect(cmd).toContain('--label="ClawVault: OPENAI_API_KEY"')
      expect(cmd).toContain('sk-test-key-12345')
    })

    it('should escape special characters in secret values', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, '', '')
      })

      const specialValue = 'key with "quotes" and $dollars'
      await provider.set('TEST_SECRET', specialValue)

      const cmd = mockExecImpl.mock.calls[0][0] as string
      expect(cmd).toContain('\\$')
      expect(cmd).toContain('\\"')
    })

    it('should propagate errors from secret-tool', async () => {
      const error = new Error('secret-tool: command not found')
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(error, '', '')
      })

      await expect(provider.set('TEST_SECRET', 'value')).rejects.toThrow('secret-tool: command not found')
    })
  })

  describe('get()', () => {
    it('should retrieve a secret using secret-tool lookup', async () => {
      mockExecImpl.mockImplementation((cmd: string, cb: any) => {
        if (cmd.includes('lookup')) {
          cb(null, 'sk-retrieved-key-12345', '')
        } else {
          cb(null, '', '')
        }
      })

      const value = await provider.get('OPENAI_API_KEY')

      expect(mockExecImpl).toHaveBeenCalled()
      const _cmd = mockExecImpl.mock.calls[0][0] as string
      expect(_cmd).toContain('secret-tool lookup')
      expect(_cmd).toContain('service "clawvault"')
      expect(_cmd).toContain('key "OPENAI_API_KEY"')
      expect(value).toBe('sk-retrieved-key-12345')
    })

    it('should return null for non-existent secrets', async () => {
      const error = new Error('secret-tool: not found')
      ;(error as any).code = 1
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(error, '', '')
      })

      const value = await provider.get('NONEXISTENT_SECRET')

      expect(value).toBeNull()
    })

    it('should trim whitespace from retrieved values', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, '  sk-key-with-spaces  \n', '')
      })

      const value = await provider.get('TEST_SECRET')

      expect(value).toBe('sk-key-with-spaces')
    })

    it('should return null for empty output', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, '   ', '')
      })

      const value = await provider.get('TEST_SECRET')

      expect(value).toBeNull()
    })
  })

  describe('delete()', () => {
    it('should delete a secret using secret-tool remove', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, '', '')
      })

      await provider.delete('OPENAI_API_KEY')

      expect(mockExecImpl).toHaveBeenCalled()
      const cmd = mockExecImpl.mock.calls[0][0] as string
      expect(cmd).toContain('secret-tool remove')
      expect(cmd).toContain('service "clawvault"')
      expect(cmd).toContain('key "OPENAI_API_KEY"')
    })

    it('should propagate errors from secret-tool remove', async () => {
      const error = new Error('Failed to remove item')
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(error, '', '')
      })

      await expect(provider.delete('TEST_SECRET')).rejects.toThrow('Failed to remove item')
    })
  })

  describe('list()', () => {
    it('should list secrets using gdbus', async () => {
      const gdbusOutput = "({'key': <'OPENAI_API_KEY'>}, {'key': <'ANTHROPIC_API_KEY'>},)"
      mockExecImpl.mockImplementation((cmd: string, cb: any) => {
        if (cmd.includes('gdbus')) {
          cb(null, gdbusOutput, '')
        } else {
          cb(null, '', '')
        }
      })

      const secrets = await provider.list()

      expect(mockExecImpl).toHaveBeenCalled()
      const _cmd = mockExecImpl.mock.calls[0][0] as string
      expect(_cmd).toContain('gdbus call')
      expect(_cmd).toContain('org.freedesktop.secrets')
      expect(_cmd).toContain("{'service': <'clawvault'>}")
      expect(secrets).toEqual(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'])
    })

    it('should return empty array when gdbus fails', async () => {
      mockExecImpl.mockImplementation((cmd: string, cb: any) => {
        if (cmd.includes('gdbus')) {
          cb(new Error('gdbus: connection error'), '', '')
        } else {
          cb(null, '', '')
        }
      })

      const secrets = await provider.list()

      expect(secrets).toEqual([])
    })

    it('should return empty array for empty gdbus output', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, '', '')
      })

      const secrets = await provider.list()

      expect(secrets).toEqual([])
    })

    it('should parse gdbus output with multiple secrets', async () => {
      const gdbusOutput = "({'key': <'FIRST_SECRET'>}, {'key': <'SECOND_SECRET'>}, {'key': <'THIRD_SECRET'>},)"
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, gdbusOutput, '')
      })

      const secrets = await provider.list()

      expect(secrets).toHaveLength(3)
      expect(secrets).toContain('FIRST_SECRET')
      expect(secrets).toContain('SECOND_SECRET')
      expect(secrets).toContain('THIRD_SECRET')
    })

    it('should handle malformed gdbus output gracefully', async () => {
      const malformedOutputs = [
        'invalid output',
        '()',
        "({'other': <'value'>},)",
        ''
      ]

      for (const output of malformedOutputs) {
        mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
          cb(null, output, '')
        })

        const secrets = await provider.list()
        expect(Array.isArray(secrets)).toBe(true)
      }
    })
  })

  describe('has()', () => {
    it('should return true for existing secrets', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, 'secret-value', '')
      })

      const exists = await provider.has('OPENAI_API_KEY')

      expect(exists).toBe(true)
    })

    it('should return false for non-existent secrets', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(new Error('not found'), '', '')
      })

      const exists = await provider.has('NONEXISTENT_SECRET')

      expect(exists).toBe(false)
    })

    it('should return false for empty values', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, '   ', '')
      })

      const exists = await provider.has('EMPTY_SECRET')

      expect(exists).toBe(false)
    })
  })

  describe('value escaping', () => {
    it('should escape backslashes', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, '', '')
      })

      await provider.set('TEST', 'value\\with\\backslashes')

      const cmd = mockExecImpl.mock.calls[0][0] as string
      expect(cmd).toContain('value\\\\with\\\\backslashes')
    })

    it('should escape double quotes', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, '', '')
      })

      await provider.set('TEST', 'value"with"quotes')

      const cmd = mockExecImpl.mock.calls[0][0] as string
      expect(cmd).toContain('value\\"with\\"quotes')
    })

    it('should escape backticks', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, '', '')
      })

      await provider.set('TEST', 'value`with`backticks')

      const cmd = mockExecImpl.mock.calls[0][0] as string
      expect(cmd).toContain('value\\`with\\`backticks')
    })

    it('should escape dollar signs', async () => {
      mockExecImpl.mockImplementation((_cmd: string, cb: any) => {
        cb(null, '', '')
      })

      await provider.set('TEST', 'value$with$dollars')

      const cmd = mockExecImpl.mock.calls[0][0] as string
      expect(cmd).toContain('value\\$with\\$dollars')
    })
  })
})
