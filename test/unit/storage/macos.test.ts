/**
 * macOS Keychain Provider Tests
 *
 * Verifies that the provider uses execFile (no shell) for all operations
 * and validates secret names before any command execution.
 */

import { MacOSKeychainProvider } from '../../../src/storage/providers/macos'
import { StorageProvider } from '../../../src/storage/interfaces'

jest.mock('child_process', () => ({
  execFile: jest.fn()
}))

import { execFile } from 'child_process'

describe('MacOSKeychainProvider', () => {
  let provider: StorageProvider
  let mockExecFile: jest.Mock

  beforeEach(() => {
    provider = new MacOSKeychainProvider()
    mockExecFile = execFile as unknown as jest.Mock
    jest.clearAllMocks()
  })

  describe('set()', () => {
    it('should use execFile with argument arrays (no shell)', async () => {
      mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
        cb(null, '', '')
      })

      await provider.set('OPENAI_API_KEY', 'sk-test-value')

      expect(mockExecFile).toHaveBeenCalled()
      expect(mockExecFile.mock.calls[0][0]).toBe('security')
      const args = mockExecFile.mock.calls[0][1] as string[]
      expect(args[0]).toBe('add-generic-password')
      expect(args).toContain('-a')
      expect(args).toContain('clawvault')
      expect(args).toContain('-s')
      expect(args).toContain('OPENAI_API_KEY')
      expect(args).toContain('-w')
      expect(args).toContain('sk-test-value')
    })

    it('should handle duplicate by deleting and re-adding', async () => {
      let callCount = 0
      mockExecFile.mockImplementation((_bin: string, args: string[], _opts: any, cb: any) => {
        callCount++
        if (callCount === 1 && args[0] === 'add-generic-password') {
          const error = new Error('duplicate') as any
          error.stderr = 'duplicate'
          cb(error, '', 'duplicate')
          return
        }
        cb(null, '', '')
      })

      await provider.set('TEST_KEY', 'value')
      // Should have called: add (fail), delete, add (succeed)
      expect(mockExecFile.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('should reject invalid secret names', async () => {
      await expect(provider.set('bad-name', 'value')).rejects.toThrow('Invalid secret name')
      expect(mockExecFile).not.toHaveBeenCalled()
    })

    it('should never use shell string interpolation for values', async () => {
      mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
        cb(null, '', '')
      })

      const dangerousValue = '$(rm -rf /); `evil`; "double"; \'single\''
      await provider.set('TEST_KEY', dangerousValue)

      // The value should be in the args array, NOT in a shell command string
      const args = mockExecFile.mock.calls[0][1] as string[]
      const wIndex = args.indexOf('-w')
      expect(args[wIndex + 1]).toBe(dangerousValue)
    })
  })

  describe('get()', () => {
    it('should retrieve via execFile', async () => {
      mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
        cb(null, 'sk-retrieved-key-12345', '')
      })

      const value = await provider.get('OPENAI_API_KEY')
      expect(value).toBe('sk-retrieved-key-12345')
      expect(mockExecFile.mock.calls[0][0]).toBe('security')
      expect(mockExecFile.mock.calls[0][1]).toContain('find-generic-password')
    })

    it('should return null for non-existent secrets', async () => {
      mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
        cb(new Error('not found'), '', '')
      })

      const value = await provider.get('NONEXISTENT')
      expect(value).toBeNull()
    })

    it('should reject invalid names before calling commands', async () => {
      await expect(provider.get('bad-name')).rejects.toThrow('Invalid secret name')
      expect(mockExecFile).not.toHaveBeenCalled()
    })
  })

  describe('list()', () => {
    it('should parse dump-keychain output', async () => {
      const dumpOutput = `keychain: "/Users/test/Library/Keychains/login.keychain-db"
version: 256
class: "genp"
attributes:
    "acct"<blob>="clawvault"
    "svce"<blob>="OPENAI_API_KEY"
keychain: "/Users/test/Library/Keychains/login.keychain-db"
version: 256
class: "genp"
attributes:
    "acct"<blob>="clawvault"
    "svce"<blob>="ANTHROPIC_API_KEY"
keychain: "/Users/test/Library/Keychains/login.keychain-db"
version: 256
class: "genp"
attributes:
    "acct"<blob>="other-app"
    "svce"<blob>="UNRELATED_KEY"
`
      mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
        cb(null, dumpOutput, '')
      })

      const secrets = await provider.list()
      expect(secrets).toEqual(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'])
      expect(secrets).not.toContain('UNRELATED_KEY')
    })
  })

  describe('validation', () => {
    it('should reject invalid secret names for all operations', async () => {
      await expect(provider.set('bad-name', 'v')).rejects.toThrow('Invalid secret name')
      await expect(provider.get('bad-name')).rejects.toThrow('Invalid secret name')
      await expect(provider.delete('bad-name')).rejects.toThrow('Invalid secret name')
    })
  })
})
