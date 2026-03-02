import { Readable, Writable } from 'stream'
import { runResolveCommand } from '../../../src/cli/commands/resolve'
import type { RawAccountLookupProvider, StorageProvider } from '../../../src/storage/interfaces'

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

function makeStorage(values: Record<string, string>): StorageProvider {
  return {
    async get(name: string): Promise<string | null> {
      return values[name] ?? null
    },
    async set(): Promise<void> {},
    async delete(): Promise<void> {},
    async list(): Promise<string[]> { return Object.keys(values) },
    async has(name: string): Promise<boolean> { return name in values },
  }
}

function makeRawLookupStorage(values: Record<string, string>): StorageProvider & RawAccountLookupProvider {
  return {
    async get(name: string): Promise<string | null> {
      if (name.includes('/')) {
        throw new Error(`Invalid secret name: ${name}`)
      }
      return values[name] ?? null
    },
    async getRawAccount(account: string): Promise<string | null> {
      return values[account] ?? null
    },
    async set(): Promise<void> {},
    async delete(): Promise<void> {},
    async list(): Promise<string[]> { return Object.keys(values) },
    async has(name: string): Promise<boolean> { return name in values },
  }
}

describe('resolve command', () => {
  const originalExitCode = process.exitCode

  beforeEach(() => {
    process.exitCode = undefined
  })

  afterAll(() => {
    process.exitCode = originalExitCode
  })

  it('resolves multiple ids and writes protocol JSON to stdout', async () => {
    const stdout = new MemoryWritable()
    const stderr = new MemoryWritable()
    const stdin = Readable.from([
      JSON.stringify({
        protocolVersion: 1,
        provider: 'clawvault',
        ids: ['providers/openai/apiKey', 'providers/openrouter/apiKey'],
      }),
    ])

    await runResolveCommand(
      {},
      { stdin, stdout, stderr },
      async () => makeStorage({
        'providers/openai/apiKey': 'sk-openai',
        'providers/openrouter/apiKey': 'sk-openrouter',
      })
    )

    expect(JSON.parse(stdout.toString())).toEqual({
      protocolVersion: 1,
      values: {
        'providers/openai/apiKey': 'sk-openai',
        'providers/openrouter/apiKey': 'sk-openrouter',
      },
    })
    expect(stderr.toString()).toBe('')
    expect(process.exitCode).toBeUndefined()
  })

  it('returns per-id errors for missing keys without failing the whole request', async () => {
    const stdout = new MemoryWritable()
    const stderr = new MemoryWritable()
    const stdin = Readable.from([
      JSON.stringify({
        protocolVersion: 1,
        provider: 'clawvault',
        ids: ['providers/openai/apiKey', 'providers/openrouter/apiKey'],
      }),
    ])

    await runResolveCommand(
      {},
      { stdin, stdout, stderr },
      async () => makeStorage({
        'providers/openai/apiKey': 'sk-openai',
      })
    )

    expect(JSON.parse(stdout.toString())).toEqual({
      protocolVersion: 1,
      values: {
        'providers/openai/apiKey': 'sk-openai',
      },
      errors: {
        'providers/openrouter/apiKey': {
          message: 'not found in keychain',
        },
      },
    })
    expect(stderr.toString()).toBe('')
    expect(process.exitCode).toBeUndefined()
  })

  it('resolves slash-based OpenClaw ids through raw account lookup', async () => {
    const stdout = new MemoryWritable()
    const stderr = new MemoryWritable()
    const stdin = Readable.from([
      JSON.stringify({
        protocolVersion: 1,
        provider: 'clawvault',
        ids: ['providers/openai/apiKey'],
      }),
    ])

    await runResolveCommand(
      {},
      { stdin, stdout, stderr },
      async () => makeRawLookupStorage({
        'providers/openai/apiKey': 'sk-openai',
      })
    )

    expect(JSON.parse(stdout.toString())).toEqual({
      protocolVersion: 1,
      values: {
        'providers/openai/apiKey': 'sk-openai',
      },
    })
    expect(stderr.toString()).toBe('')
    expect(process.exitCode).toBeUndefined()
  })

  it('returns fatal error JSON for malformed input', async () => {
    const stdout = new MemoryWritable()
    const stderr = new MemoryWritable()
    const stdin = Readable.from(['{not-json'])

    await runResolveCommand(
      {},
      { stdin, stdout, stderr },
      async () => makeStorage({})
    )

    expect(JSON.parse(stdout.toString())).toEqual({
      protocolVersion: 1,
      error: {
        message: 'Malformed JSON input',
      },
    })
    expect(stderr.toString()).toBe('')
    expect(process.exitCode).toBe(1)
  })

  it('writes diagnostics to stderr when debug is enabled', async () => {
    const stdout = new MemoryWritable()
    const stderr = new MemoryWritable()
    const stdin = Readable.from([
      JSON.stringify({
        protocolVersion: 1,
        provider: 'clawvault',
        ids: ['providers/openai/apiKey'],
      }),
    ])

    await runResolveCommand(
      { debug: true },
      { stdin, stdout, stderr },
      async () => makeStorage({
        'providers/openai/apiKey': 'sk-openai',
      })
    )

    expect(JSON.parse(stdout.toString())).toEqual({
      protocolVersion: 1,
      values: {
        'providers/openai/apiKey': 'sk-openai',
      },
    })
    expect(stderr.toString()).toContain('[resolve] received')
    expect(stderr.toString()).toContain('[resolve] resolving 1 secret id(s)')
    expect(stderr.toString()).toContain('[resolve] hit: providers/openai/apiKey')
    expect(process.exitCode).toBeUndefined()
  })

  it('returns fatal error JSON for unsupported protocolVersion', async () => {
    const stdout = new MemoryWritable()
    const stderr = new MemoryWritable()
    const stdin = Readable.from([
      JSON.stringify({
        protocolVersion: 999,
        provider: 'clawvault',
        ids: ['providers/openai/apiKey'],
      }),
    ])

    await runResolveCommand(
      {},
      { stdin, stdout, stderr },
      async () => makeStorage({ 'providers/openai/apiKey': 'sk-openai' })
    )

    const output = JSON.parse(stdout.toString())
    expect(output.protocolVersion).toBe(1)
    expect(output.error?.message).toMatch(/protocol.?version/i)
    expect(stderr.toString()).toBe('')
    expect(process.exitCode).toBe(1)
  })
})
