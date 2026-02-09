/**
 * Windows Credential Manager Provider Tests
 *
 * Verifies that the provider uses execFile (no shell) for all operations
 * and validates secret names before any command execution.
 */

import { WindowsCredentialManager } from '../../../src/storage/providers/windows'
import { StorageProvider } from '../../../src/storage/interfaces'

jest.mock('child_process', () => ({
  execFile: jest.fn()
}))

import { execFile } from 'child_process'

describe('WindowsCredentialManager', () => {
  let provider: StorageProvider
  let mockExecFile: jest.Mock

  beforeEach(() => {
    provider = new WindowsCredentialManager()
    mockExecFile = execFile as unknown as jest.Mock
    jest.clearAllMocks()
  })

  describe('set()', () => {
    it('should use execFile with argument arrays (no shell)', async () => {
      mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
        cb(null, '', '')
      })

      await provider.set('OPENAI_API_KEY', 'sk-test-value')

      // First call is delete (cleanup), second is add
      const addCall = mockExecFile.mock.calls.find(
        (call: any[]) => call[0] === 'cmdkey' && (call[1] as string[]).some((a: string) => a.includes('/generic:'))
      )
      expect(addCall).toBeDefined()
      expect(addCall![0]).toBe('cmdkey')
      const args = addCall![1] as string[]
      expect(args.some((a: string) => a.includes('clawvault:OPENAI_API_KEY'))).toBe(true)
      expect(args.some((a: string) => a.startsWith('/pass:'))).toBe(true)
    })

    it('should reject invalid secret names', async () => {
      await expect(provider.set('bad-name', 'value')).rejects.toThrow('Invalid secret name')
      expect(mockExecFile).not.toHaveBeenCalled()
    })

    it('should never use shell string interpolation for values', async () => {
      mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
        cb(null, '', '')
      })

      const dangerousValue = '& del /f /q C:\\; | echo hacked'
      await provider.set('TEST_KEY', dangerousValue)

      // The value should appear as part of /pass: arg, not shell-interpreted
      const addCall = mockExecFile.mock.calls.find(
        (call: any[]) => (call[1] as string[]).some((a: string) => a.startsWith('/pass:'))
      )
      expect(addCall).toBeDefined()
      const passArg = (addCall![1] as string[]).find((a: string) => a.startsWith('/pass:'))
      expect(passArg).toBe(`/pass:${dangerousValue}`)
    })
  })

  describe('get()', () => {
    it('should use powershell with execFile and env var for target', async () => {
      mockExecFile.mockImplementation((_bin: string, _args: string[], opts: any, cb: any) => {
        // Verify the target is passed via environment, not string interpolation
        expect(opts.env.CV_TARGET).toBe('clawvault:OPENAI_API_KEY')
        cb(null, 'sk-retrieved-value', '')
      })

      const value = await provider.get('OPENAI_API_KEY')
      expect(value).toBe('sk-retrieved-value')
      expect(mockExecFile.mock.calls[0][0]).toBe('powershell')
    })

    it('should return null for non-existent secrets', async () => {
      mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
        cb(null, '', '')
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
    it('should parse cmdkey output for clawvault entries', async () => {
      const cmdkeyOutput = `
Currently stored credentials:

    Target: LegacyGeneric:target=clawvault:OPENAI_API_KEY
    Type: Generic
    User: OPENAI_API_KEY

    Target: LegacyGeneric:target=clawvault:ANTHROPIC_API_KEY
    Type: Generic
    User: ANTHROPIC_API_KEY

    Target: LegacyGeneric:target=other-app
    Type: Generic
    User: something
`
      mockExecFile.mockImplementation((_bin: string, _args: string[], _opts: any, cb: any) => {
        cb(null, cmdkeyOutput, '')
      })

      const secrets = await provider.list()
      expect(secrets).toEqual(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'])
      expect(secrets).not.toContain('something')
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
