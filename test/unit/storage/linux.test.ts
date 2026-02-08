/**
 * Linux Keyring Provider Tests
 */

import { LinuxKeyringProvider } from '../../../src/storage/providers/linux'
import { StorageProvider } from '../../../src/storage/interfaces'

jest.mock('child_process', () => ({
  execFile: jest.fn()
}))

import { execFile } from 'child_process'

describe('LinuxKeyringProvider', () => {
  let provider: StorageProvider
  let mockExecFile: jest.Mock

  beforeEach(() => {
    provider = new LinuxKeyringProvider()
    mockExecFile = execFile as unknown as jest.Mock
    jest.clearAllMocks()
  })

  describe('set()', () => {
    it('should store a secret using secret-tool', async () => {
      mockExecFile.mockImplementation((_bin: string, _args: string[], cb: any) => {
        cb(null, '', '')
        return { stdin: { write: jest.fn(), end: jest.fn() } }
      })

      await provider.set('OPENAI_API_KEY', 'sk-test-key-12345')

      expect(mockExecFile).toHaveBeenCalled()
      expect(mockExecFile.mock.calls[0][0]).toBe('secret-tool')
      const args = mockExecFile.mock.calls[0][1] as string[]
      expect(args).toContain('store')
      expect(args).toContain('service')
      expect(args).toContain('clawvault')
      expect(args).toContain('key')
      expect(args).toContain('OPENAI_API_KEY')
    })

    it('should support multiline secret values without shell escaping', async () => {
      const write = jest.fn()
      const end = jest.fn()
      mockExecFile.mockImplementation((_bin: string, _args: string[], cb: any) => {
        cb(null, '', '')
        return { stdin: { write, end } }
      })

      const multiline = 'line1\nline2\nline3'
      await provider.set('TEST_SECRET', multiline)

      expect(write).toHaveBeenCalledWith(multiline)
      expect(end).toHaveBeenCalled()
    })

    it('should propagate errors from secret-tool', async () => {
      const error = new Error('secret-tool: command not found')
      mockExecFile.mockImplementation((_bin: string, _args: string[], cb: any) => {
        cb(error, '', '')
        return { stdin: { write: jest.fn(), end: jest.fn() } }
      })

      await expect(provider.set('TEST_SECRET', 'value')).rejects.toThrow('secret-tool: command not found')
    })
  })

  describe('get()', () => {
    it('should retrieve a secret using secret-tool lookup', async () => {
      mockExecFile.mockImplementation((_bin: string, args: string[], cb: any) => {
        if (args.includes('lookup')) {
          cb(null, 'sk-retrieved-key-12345', '')
        } else {
          cb(null, '', '')
        }
      })

      const value = await provider.get('OPENAI_API_KEY')

      expect(mockExecFile).toHaveBeenCalled()
      expect(mockExecFile.mock.calls[0][0]).toBe('secret-tool')
      const args = mockExecFile.mock.calls[0][1] as string[]
      expect(args).toContain('lookup')
      expect(args).toContain('service')
      expect(args).toContain('clawvault')
      expect(args).toContain('key')
      expect(args).toContain('OPENAI_API_KEY')
      expect(value).toBe('sk-retrieved-key-12345')
    })

    it('should return null for non-existent secrets', async () => {
      const error = new Error('secret-tool: not found')
      ;(error as any).code = 1
      mockExecFile.mockImplementation((_bin: string, _args: string[], cb: any) => {
        cb(error, '', '')
      })

      const value = await provider.get('NONEXISTENT_SECRET')

      expect(value).toBeNull()
    })
  })

  describe('list()', () => {
    it('should list secrets using gdbus', async () => {
      const gdbusOutput = "({'key': <'OPENAI_API_KEY'>}, {'key': <'ANTHROPIC_API_KEY'>},)"
      mockExecFile.mockImplementation((bin: string, _args: string[], cb: any) => {
        if (bin === 'gdbus') cb(null, gdbusOutput, '')
        else cb(null, '', '')
      })

      const secrets = await provider.list()
      expect(secrets).toEqual(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'])
    })
  })

  describe('validation', () => {
    it('should reject invalid secret names', async () => {
      await expect(provider.set('bad-name', 'value')).rejects.toThrow('Invalid secret name')
      await expect(provider.get('bad-name')).rejects.toThrow('Invalid secret name')
      await expect(provider.delete('bad-name')).rejects.toThrow('Invalid secret name')
    })
  })
})
