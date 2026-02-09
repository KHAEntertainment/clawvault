import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  discoverAuthStorePaths,
  migrateAllOpenClawAuthStores,
  buildEnvVarName,
  isEnvPlaceholder
} from '../../../src/openclaw/migrate'

import type { StorageProvider } from '../../../src/storage/interfaces'

class MemoryStorage implements StorageProvider {
  public values: Record<string, string> = {}
  async set(name: string, value: string): Promise<void> {
    this.values[name] = value
  }
  async get(name: string): Promise<string | null> {
    return this.values[name] ?? null
  }
  async delete(name: string): Promise<void> {
    delete this.values[name]
  }
  async list(): Promise<string[]> {
    return Object.keys(this.values)
  }
  async has(name: string): Promise<boolean> {
    return name in this.values
  }
}

const tempDirs: string[] = []

async function mkTempOpenClawDir(): Promise<string> {
  const root = join(tmpdir(), `clawvault-openclaw-test-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await fs.mkdir(root, { recursive: true })
  tempDirs.push(root)
  return root
}

describe('openclaw migrate', () => {
  afterAll(async () => {
    await Promise.all(tempDirs.map(dir => fs.rm(dir, { recursive: true, force: true })))
  })

  it('buildEnvVarName should produce stable env var names', () => {
    const envVar = buildEnvVarName({
      prefix: 'OPENCLAW',
      provider: 'anthropic',
      profileId: 'anthropic:default',
      field: 'key'
    })
    expect(envVar).toBe('OPENCLAW_ANTHROPIC_ANTHROPIC_DEFAULT_KEY')
  })

  it('isEnvPlaceholder should detect ${ENV_VAR}', () => {
    expect(isEnvPlaceholder('${FOO_BAR}')).toBe(true)
    expect(isEnvPlaceholder('FOO_BAR')).toBe(false)
    expect(isEnvPlaceholder('${foo}')).toBe(false)
  })

  it('discoverAuthStorePaths should find agent auth-profiles.json files', async () => {
    const openclawDir = await mkTempOpenClawDir()
    const agentsDir = join(openclawDir, 'agents')
    await fs.mkdir(join(agentsDir, 'a1', 'agent'), { recursive: true })
    await fs.mkdir(join(agentsDir, 'a2', 'agent'), { recursive: true })

    await fs.writeFile(
      join(agentsDir, 'a1', 'agent', 'auth-profiles.json'),
      JSON.stringify({ version: 1, profiles: {} }),
      'utf-8'
    )

    const found = await discoverAuthStorePaths({ openclawDir })
    expect(found).toEqual([
      { agentId: 'a1', authStorePath: join(agentsDir, 'a1', 'agent', 'auth-profiles.json') }
    ])
  })

  it('dry-run should not write keyring and should not modify files', async () => {
    const openclawDir = await mkTempOpenClawDir()
    const agentId = 'agent-1'
    const authPath = join(openclawDir, 'agents', agentId, 'agent', 'auth-profiles.json')
    await fs.mkdir(join(openclawDir, 'agents', agentId, 'agent'), { recursive: true })

    const plaintextValue = 'unit-test-value-12345'
    await fs.writeFile(
      authPath,
      JSON.stringify({
        version: 1,
        profiles: {
          'anthropic:default': { type: 'api_key', provider: 'anthropic', key: plaintextValue }
        }
      }),
      'utf-8'
    )

    const storage = new MemoryStorage()

    const [report] = await migrateAllOpenClawAuthStores({
      openclawDir,
      dryRun: true,
      storage
    })

    expect(report.changed).toBe(true)
    expect(Object.keys(storage.values)).toHaveLength(0)

    const after = await fs.readFile(authPath, 'utf-8')
    expect(after).toContain(plaintextValue)
    expect(JSON.stringify(report)).not.toContain(plaintextValue)
  })

  it('apply should store secrets and replace fields with ${ENV_VAR} placeholders (with backup)', async () => {
    const openclawDir = await mkTempOpenClawDir()
    const agentId = 'agent-2'
    const agentDir = join(openclawDir, 'agents', agentId, 'agent')
    const authPath = join(agentDir, 'auth-profiles.json')
    await fs.mkdir(agentDir, { recursive: true })

    const apiKey = 'api-key-abc'
    const accessToken = 'access-token-xyz'
    const refreshToken = 'refresh-token-zzz'

    await fs.writeFile(
      authPath,
      JSON.stringify({
        version: 1,
        profiles: {
          'anthropic:default': { type: 'api_key', provider: 'anthropic', key: apiKey },
          'google:user@example.com': {
            type: 'oauth',
            provider: 'google',
            accessToken,
            refreshToken
          },
          'already:done': { type: 'api_key', provider: 'already', key: '${EXISTING_ENV}' }
        }
      }),
      'utf-8'
    )

    const storage = new MemoryStorage()

    const reports = await migrateAllOpenClawAuthStores({
      openclawDir,
      dryRun: false,
      backup: true,
      prefix: 'OPENCLAW',
      profileEnvVarMap: { 'anthropic:default': 'ANTHROPIC_API_KEY' },
      storage
    })

    expect(reports).toHaveLength(1)
    const report = reports[0]
    expect(report.changed).toBe(true)
    expect(report.changes.some(c => c.envVar === 'ANTHROPIC_API_KEY')).toBe(true)

    expect(storage.values.ANTHROPIC_API_KEY).toBe(apiKey)
    expect(Object.values(storage.values)).toContain(accessToken)
    expect(Object.values(storage.values)).toContain(refreshToken)

    const afterRaw = await fs.readFile(authPath, 'utf-8')
    expect(afterRaw).not.toContain(apiKey)
    expect(afterRaw).not.toContain(accessToken)
    expect(afterRaw).not.toContain(refreshToken)
    expect(JSON.stringify(report)).not.toContain(apiKey)

    const after = JSON.parse(afterRaw) as any
    expect(after.profiles['anthropic:default'].key).toBe('${ANTHROPIC_API_KEY}')
    expect(after.profiles['already:done'].key).toBe('${EXISTING_ENV}')

    // Backup exists
    const files = await fs.readdir(agentDir)
    expect(files.some(f => f.startsWith('auth-profiles.json.bak.'))).toBe(true)
  })
})
