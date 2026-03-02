import { Command } from 'commander'
import { createStorage } from '../../storage/index.js'
import type { RawAccountLookupProvider, StorageProvider } from '../../storage/interfaces.js'

interface ResolveOptions {
  debug?: boolean
}

interface ResolveRequest {
  protocolVersion: number
  provider?: string
  ids: string[]
}

interface ResolveErrorEntry {
  message: string
}

interface ResolveResponse {
  protocolVersion: 1
  values: Record<string, string>
  errors?: Record<string, ResolveErrorEntry>
}

interface FatalResolveResponse {
  protocolVersion: 1
  error: ResolveErrorEntry
}

interface ResolveIo {
  stdin: NodeJS.ReadableStream
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
}

const PROTOCOL_VERSION = 1 as const

export const resolveCommand = new Command('resolve')
  .description('Resolve secrets via the OpenClaw exec provider protocol')
  .option('--debug', 'Write protocol diagnostics to stderr')
  .action(async (options: ResolveOptions) => {
    await runResolveCommand(options)
  })

export async function runResolveCommand(
  options: ResolveOptions,
  io: ResolveIo = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
  storageFactory: () => Promise<StorageProvider> = createStorage
): Promise<void> {
  const debug = options.debug ?? false

  try {
    const rawInput = await readStdin(io.stdin)
    debugLog(io.stderr, debug, `received ${rawInput.length} bytes from stdin`)

    const request = parseResolveRequest(rawInput)
    debugLog(io.stderr, debug, `resolving ${request.ids.length} secret id(s)`)

    const storage = await storageFactory()
    const response = await resolveRequestIds(request, storage, io.stderr, debug)
    writeJson(io.stdout, response)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown resolve error'
    debugLog(io.stderr, debug, `fatal resolve error: ${message}`)
    writeJson(io.stdout, {
      protocolVersion: PROTOCOL_VERSION,
      error: { message },
    } satisfies FatalResolveResponse)
    process.exitCode = 1
  }
}

async function resolveRequestIds(
  request: ResolveRequest,
  storage: StorageProvider,
  stderr: NodeJS.WritableStream,
  debug: boolean
): Promise<ResolveResponse> {
  const values: Record<string, string> = {}
  const errors: Record<string, ResolveErrorEntry> = {}

  for (const id of request.ids) {
    try {
      const value = await lookupSecretById(storage, id)
      if (value === null) {
        errors[id] = { message: 'not found in keychain' }
        debugLog(stderr, debug, `miss: ${id}`)
        continue
      }

      values[id] = value
      debugLog(stderr, debug, `hit: ${id}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'keychain lookup failed'
      throw new Error(`Failed to resolve "${id}": ${message}`)
    }
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    values,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  }
}

async function lookupSecretById(storage: StorageProvider, id: string): Promise<string | null> {
  const rawLookupStorage = storage as StorageProvider & Partial<RawAccountLookupProvider>
  if (typeof rawLookupStorage.getRawAccount === 'function') {
    return rawLookupStorage.getRawAccount(id)
  }

  return storage.get(id)
}

async function readStdin(stdin: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []

  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }

  return Buffer.concat(chunks).toString('utf-8')
}

function parseResolveRequest(rawInput: string): ResolveRequest {
  let parsed: unknown

  try {
    parsed = JSON.parse(rawInput)
  } catch {
    throw new Error('Malformed JSON input')
  }

  if (!isResolveRequest(parsed)) {
    throw new Error('Malformed resolve request')
  }

  if (parsed.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocolVersion: ${parsed.protocolVersion}`)
  }

  return parsed
}

function isResolveRequest(value: unknown): value is ResolveRequest {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<ResolveRequest>
  return typeof candidate.protocolVersion === 'number'
    && Array.isArray(candidate.ids)
    && candidate.ids.every(id => typeof id === 'string')
    && (candidate.provider === undefined || typeof candidate.provider === 'string')
}

function writeJson(stdout: NodeJS.WritableStream, payload: ResolveResponse | FatalResolveResponse): void {
  stdout.write(`${JSON.stringify(payload)}\n`)
}

function debugLog(stderr: NodeJS.WritableStream, enabled: boolean, message: string): void {
  if (!enabled) return
  stderr.write(`[resolve] ${message}\n`)
}
