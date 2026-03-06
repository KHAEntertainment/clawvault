// Mock inquirer and chalk before any imports
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}))

jest.mock('chalk', () => ({
  red: (s: string) => s,
  yellow: (s: string) => s,
  gray: (s: string) => s,
  green: (s: string) => s,
  cyan: (s: string) => s,
}))

jest.mock('../../../src/storage/index.js', () => ({
  createStorage: jest.fn(),
}))

jest.mock('../../../src/config/index.js', () => ({
  loadConfig: jest.fn().mockResolvedValue({
    secrets: {}
  }),
}))

import { Readable, Writable } from 'stream'
import { runAddCommand } from '../../../src/cli/commands/add'
import type { StorageProvider } from '../../../src/storage/interfaces'
import { createStorage } from '../../../src/storage/index.js'
import { loadConfig } from '../../../src/config/index.js'

class MemoryWritable extends Writable {
  private readonly chunks: Buffer[] = []

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    callback()
  }

  toString(): string {
    return Buffer.concat(this.chunks).toString('utf-8')
  }
}

function makeStorage(existingSecrets: Record<string, string> = {}): StorageProvider {
  const secrets = { ...existingSecrets }
  return {
    async get(name: string): Promise<string | null> {
      return secrets[name] ?? null
    },
    async set(name: string, value: string): Promise<void> {
      secrets[name] = value
    },
    async delete(name: string): Promise<void> {
      delete secrets[name]
    },
    async list(): Promise<string[]> { return Object.keys(secrets) },
    async has(name: string): Promise<boolean> { return name in secrets },
  }
}

describe('add command', () => {
  let originalExit: typeof process.exit
  let originalExitCode: number | undefined

  beforeEach(() => {
    originalExitCode = process.exitCode
    // Mock process.exit to prevent test from exiting
    originalExit = process.exit
    process.exit = jest.fn() as typeof process.exit
    jest.clearAllMocks()
  })

  afterEach(() => {
    process.exit = originalExit
    process.exitCode = originalExitCode
  })

  describe('runAddCommand', () => {
    it('stores secret via --value flag with valid name', async () => {
      const mockStorage = makeStorage()
      ;(createStorage as jest.Mock).mockResolvedValue(mockStorage)
      ;(loadConfig as jest.Mock).mockResolvedValue({ secrets: {} })

      const stdout = new MemoryWritable()
      const stderr = new MemoryWritable()

      await runAddCommand(
        'providers/openai/apiKey',
        { value: 'sk-test123' },
        { stdin: Readable.from([]), stdout, stderr }
      )

      expect(mockStorage.set).toHaveBeenCalledWith('providers/openai/apiKey', 'sk-test123')
      expect(stdout.toString()).toContain('stored successfully')
      expect(process.exit).not.toHaveBeenCalled()
    })

    it('exits with error for invalid secret name with --value', async () => {
      const mockStorage = makeStorage()
      ;(createStorage as jest.Mock).mockResolvedValue(mockStorage)

      const stdout = new MemoryWritable()
      const stderr = new MemoryWritable()

      await runAddCommand(
        'invalid name with spaces!',
        { value: 'sk-test123' },
        { stdin: Readable.from([]), stdout, stderr }
      )

      expect(mockStorage.set).not.toHaveBeenCalled()
      expect(stdout.toString()).toContain('Invalid secret name')
      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('reads secret from stdin with --stdin flag and valid JSON', async () => {
      const mockStorage = makeStorage()
      ;(createStorage as jest.Mock).mockResolvedValue(mockStorage)
      ;(loadConfig as jest.Mock).mockResolvedValue({ secrets: {} })

      const stdout = new MemoryWritable()
      const stderr = new MemoryWritable()
      const stdin = Readable.from([
        JSON.stringify({ name: 'providers/anthropic/apiKey', value: 'sk-ant-test' })
      ])

      await runAddCommand(
        'providers/openai/apiKey', // Should be overridden by stdin JSON
        { stdin: true },
        { stdin, stdout, stderr }
      )

      expect(mockStorage.set).toHaveBeenCalledWith('providers/anthropic/apiKey', 'sk-ant-test')
      expect(stdout.toString()).toContain('stored successfully')
      expect(process.exit).not.toHaveBeenCalled()
    })

    it('exits with error for malformed JSON with --stdin flag', async () => {
      const mockStorage = makeStorage()
      ;(createStorage as jest.Mock).mockResolvedValue(mockStorage)

      const stdout = new MemoryWritable()
      const stderr = new MemoryWritable()
      const stdin = Readable.from(['{not-json'])

      await runAddCommand(
        'test-secret',
        { stdin: true },
        { stdin, stdout, stderr }
      )

      expect(mockStorage.set).not.toHaveBeenCalled()
      expect(stdout.toString()).toContain('Failed to parse stdin JSON')
      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('exits with error for missing "value" field in stdin JSON', async () => {
      const mockStorage = makeStorage()
      ;(createStorage as jest.Mock).mockResolvedValue(mockStorage)

      const stdout = new MemoryWritable()
      const stderr = new MemoryWritable()
      const stdin = Readable.from([
        JSON.stringify({ name: 'test-secret' })
      ])

      await runAddCommand(
        'test-secret',
        { stdin: true },
        { stdin, stdout, stderr }
      )

      expect(mockStorage.set).not.toHaveBeenCalled()
      expect(stdout.toString()).toContain('Missing "value" field')
      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('uses argument name when stdin JSON has no name field', async () => {
      const mockStorage = makeStorage()
      ;(createStorage as jest.Mock).mockResolvedValue(mockStorage)
      ;(loadConfig as jest.Mock).mockResolvedValue({ secrets: {} })

      const stdout = new MemoryWritable()
      const stderr = new MemoryWritable()
      const stdin = Readable.from([
        JSON.stringify({ value: 'sk-test' }) // No name field
      ])

      await runAddCommand(
        'providers/openai/apiKey',
        { stdin: true },
        { stdin, stdout, stderr }
      )

      expect(mockStorage.set).toHaveBeenCalledWith('providers/openai/apiKey', 'sk-test')
      expect(stdout.toString()).toContain('stored successfully')
      expect(process.exit).not.toHaveBeenCalled()
    })

    it('does not overwrite existing secret', async () => {
      const mockStorage = makeStorage({ 'test-secret': 'existing-value' })
      ;(createStorage as jest.Mock).mockResolvedValue(mockStorage)
      ;(loadConfig as jest.Mock).mockResolvedValue({ secrets: {} })

      const stdout = new MemoryWritable()
      const stderr = new MemoryWritable()

      await runAddCommand(
        'test-secret',
        { value: 'new-value' },
        { stdin: Readable.from([]), stdout, stderr }
      )

      // set should not be called for existing secret
      expect(mockStorage.set).not.toHaveBeenCalled()
      expect(stdout.toString()).toContain('already exists')
      expect(process.exit).not.toHaveBeenCalled()
    })
  })

  describe('name validation', () => {
    it('accepts valid secret names', async () => {
      const validNames = [
        'providers/openai/apiKey',
        'TEST_SECRET',
        'my-secret-key',
        'api-key-123',
        'path/to/secret',
      ]

      for (const name of validNames) {
        const mockStorage = makeStorage()
        ;(createStorage as jest.Mock).mockResolvedValue(mockStorage)

        const stdout = new MemoryWritable()
        const stderr = new MemoryWritable()

        await runAddCommand(
          name,
          { value: 'test' },
          { stdin: Readable.from([]), stdout, stderr }
        )

        expect(mockStorage.set).toHaveBeenCalled()
      }
    })

    it('rejects invalid secret names', async () => {
      const invalidNames = [
        'secret with spaces',
        'secret@with!special#chars',
        '',
      ]

      for (const name of invalidNames) {
        const mockStorage = makeStorage()
        ;(createStorage as jest.Mock).mockResolvedValue(mockStorage)

        const stdout = new MemoryWritable()
        const stderr = new MemoryWritable()

        await runAddCommand(
          name,
          { value: 'test' },
          { stdin: Readable.from([]), stdout, stderr }
        )

        expect(mockStorage.set).not.toHaveBeenCalled()
        expect(stdout.toString()).toContain('Invalid secret name')
        expect(process.exit).toHaveBeenCalledWith(1)
      }
    })
  })
})
