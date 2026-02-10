import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join, dirname, basename } from 'path'
import { createStorage, type StorageProvider } from '../storage/index.js'

const AUTH_PROFILE_FILENAME = 'auth-profiles.json'

export interface DiscoverAuthStoresOptions {
  openclawDir?: string
  agentId?: string
}

export interface MigrationOptions {
  dryRun?: boolean
  openclawDir?: string
  agentId?: string
  includeOAuth?: boolean
  prefix?: string
  backup?: boolean
  profileEnvVarMap?: Record<string, string>
  storage?: StorageProvider
}

export interface MigrationChange {
  agentId: string
  authStorePath: string
  profileId: string
  provider: string
  field: string
  envVar: string
  length: number
}

export interface MigrationFileReport {
  agentId: string
  authStorePath: string
  dryRun: boolean
  changed: boolean
  changes: MigrationChange[]
  skipped: Array<{
    profileId: string
    provider: string
    field: string
    reason: 'missing' | 'empty' | 'already_placeholder' | 'unsupported_type' | 'map_ignored'
  }>
}

export function getDefaultOpenClawDir(): string {
  return join(homedir(), '.openclaw')
}

export async function discoverAuthStorePaths(
  options?: DiscoverAuthStoresOptions
): Promise<Array<{ agentId: string; authStorePath: string }>> {
  const openclawDir = options?.openclawDir ?? getDefaultOpenClawDir()
  const agentsDir = join(openclawDir, 'agents')

  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = await fs.readdir(agentsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const agentIds = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(id => (options?.agentId ? id === options.agentId : true))

  const results: Array<{ agentId: string; authStorePath: string }> = []
  for (const agentId of agentIds) {
    const authStorePath = join(agentsDir, agentId, 'agent', AUTH_PROFILE_FILENAME)
    try {
      await fs.access(authStorePath)
      results.push({ agentId, authStorePath })
    } catch {
      // ignore missing
    }
  }
  return results
}

export function isEnvPlaceholder(value: unknown): value is string {
  // Intentionally strict: only treat uppercase placeholders like ${FOO_BAR} as env refs.
  // Lower/mixed-case strings are treated as plaintext and eligible for migration.
  return typeof value === 'string' && /^\$\{[A-Z][A-Z0-9_]*\}$/.test(value)
}

function slug(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '')
}

export function buildEnvVarName(params: {
  prefix?: string
  provider: string
  profileId: string
  field: string
}): string {
  const prefix = slug(params.prefix ?? 'OPENCLAW')
  const provider = slug(params.provider || 'unknown')
  const profile = slug(params.profileId || 'unknown')
  const field = slug(params.field || 'value')
  return [prefix, provider, profile, field].filter(Boolean).join('_')
}

function validateEnvVarName(name: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid env var name: ${name}`)
  }
}

function safeProvider(credential: Record<string, unknown>, profileId: string): string {
  const provider = credential.provider
  if (typeof provider === 'string' && provider.trim() !== '') return provider
  const inferred = profileId.split(':')[0]
  return inferred || 'unknown'
}

function getOAuthSecretFields(): string[] {
  return [
    'accessToken',
    'refreshToken',
    'idToken',
    'token',
    'secret',
    'clientSecret',
    'access',      // OpenClaw uses 'access' for OAuth access token
    'refresh'      // OpenClaw uses 'refresh' for OAuth refresh token
  ]
}

async function readJsonFile(path: string): Promise<unknown> {
  const data = await fs.readFile(path, 'utf-8')
  return JSON.parse(data)
}

async function writeJsonFileAtomic(path: string, value: unknown): Promise<void> {
  const dir = dirname(path)
  const tmp = join(dir, `${basename(path)}.tmp.${process.pid}.${Date.now()}`)
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), { encoding: 'utf-8', mode: 0o600 })
  await fs.rename(tmp, path)
}

async function backupFile(path: string): Promise<string> {
  const dir = dirname(path)
  const backupPath = join(dir, `${basename(path)}.bak.${Date.now()}`)
  await fs.copyFile(path, backupPath)
  return backupPath
}

function sanitizeStorageFailureContext(
  input: {
  profileId: string
  field: string
  envVar: string
  provider: string
  agentId: string
  authStorePath: string
  },
  cause: unknown
): Error {
  return new Error(
    `Failed to store credential in keyring (agent=${input.agentId}, profile=${input.profileId}, field=${input.field}, env=${input.envVar}, provider=${input.provider}, path=${input.authStorePath})`,
    { cause }
  )
}

export async function migrateAuthStoreFile(
  agentId: string,
  authStorePath: string,
  options?: Omit<MigrationOptions, 'agentId' | 'openclawDir'>
): Promise<MigrationFileReport> {
  const dryRun = options?.dryRun ?? true
  const includeOAuth = options?.includeOAuth ?? true
  const prefix = options?.prefix ?? 'OPENCLAW'
  const backup = options?.backup ?? true
  const profileEnvVarMap = options?.profileEnvVarMap ?? {}

  const storage = options?.storage ?? (await createStorage())

  const root = await readJsonFile(authStorePath)
  if (typeof root !== 'object' || root === null) {
    throw new Error(`Invalid auth store JSON (not an object): ${authStorePath}`)
  }

  const store = root as Record<string, unknown>
  const profilesUnknown = store.profiles
  if (typeof profilesUnknown !== 'object' || profilesUnknown === null || Array.isArray(profilesUnknown)) {
    throw new Error(`Invalid auth store JSON (missing profiles): ${authStorePath}`)
  }

  const profiles = profilesUnknown as Record<string, unknown>
  const updatedProfiles: Record<string, unknown> = { ...profiles }
  const changes: MigrationChange[] = []
  const skipped: MigrationFileReport['skipped'] = []

  const oauthFields = getOAuthSecretFields()

  for (const [profileId, credentialUnknown] of Object.entries(profiles)) {
    if (typeof credentialUnknown !== 'object' || credentialUnknown === null || Array.isArray(credentialUnknown)) {
      skipped.push({ profileId, provider: 'unknown', field: 'credential', reason: 'missing' })
      continue
    }

    const credential = credentialUnknown as Record<string, unknown>
    const type = credential.type
    const provider = safeProvider(credential, profileId)

    if (type === 'api_key') {
      const current = credential.key
      if (isEnvPlaceholder(current)) {
        skipped.push({ profileId, provider, field: 'key', reason: 'already_placeholder' })
        continue
      }
      if (typeof current !== 'string') {
        skipped.push({ profileId, provider, field: 'key', reason: 'missing' })
        continue
      }
      if (current.trim() === '') {
        skipped.push({ profileId, provider, field: 'key', reason: 'empty' })
        continue
      }

      const mapped = profileEnvVarMap[profileId]
      const envVar = mapped ?? buildEnvVarName({ prefix, provider, profileId, field: 'key' })
      validateEnvVarName(envVar)

      if (!dryRun) {
        try {
          await storage.set(envVar, current)
        } catch (error: unknown) {
          throw sanitizeStorageFailureContext(
            {
            agentId,
            authStorePath,
            profileId,
            field: 'key',
            envVar,
            provider
            },
            error
          )
        }
      }

      updatedProfiles[profileId] = {
        ...credential,
        key: '${' + envVar + '}'
      }

      changes.push({
        agentId,
        authStorePath,
        profileId,
        provider,
        field: 'key',
        envVar,
        length: current.length
      })
      continue
    }

    if (type === 'oauth' && includeOAuth) {
      if (profileId in profileEnvVarMap) {
        skipped.push({ profileId, provider, field: 'map', reason: 'map_ignored' })
      }

      let updated = false
      const next: Record<string, unknown> = { ...credential }

      for (const field of oauthFields) {
        const current = credential[field]
        if (isEnvPlaceholder(current)) {
          skipped.push({ profileId, provider, field, reason: 'already_placeholder' })
          continue
        }
        if (typeof current !== 'string') {
          continue
        }
        if (current.trim() === '') {
          skipped.push({ profileId, provider, field, reason: 'empty' })
          continue
        }

        const envVar = buildEnvVarName({ prefix, provider, profileId, field })
        validateEnvVarName(envVar)

        if (!dryRun) {
          try {
            await storage.set(envVar, current)
          } catch (error: unknown) {
            throw sanitizeStorageFailureContext(
              {
              agentId,
              authStorePath,
              profileId,
              field,
              envVar,
              provider
              },
              error
            )
          }
        }

        next[field] = '${' + envVar + '}'
        updated = true
        changes.push({
          agentId,
          authStorePath,
          profileId,
          provider,
          field,
          envVar,
          length: current.length
        })
      }

      if (updated) {
        updatedProfiles[profileId] = next
      } else {
        skipped.push({ profileId, provider, field: 'oauth', reason: 'missing' })
      }
      continue
    }

    skipped.push({
      profileId,
      provider,
      field: 'credential',
      reason: 'unsupported_type'
    })
  }

  const changed = changes.length > 0
  if (changed && !dryRun) {
    if (backup) {
      await backupFile(authStorePath)
    }
    await writeJsonFileAtomic(authStorePath, {
      ...store,
      profiles: updatedProfiles
    })
  }

  return {
    agentId,
    authStorePath,
    dryRun,
    changed,
    changes,
    skipped
  }
}

export async function migrateAllOpenClawAuthStores(
  options?: MigrationOptions
): Promise<MigrationFileReport[]> {
  const openclawDir = options?.openclawDir
  const agentId = options?.agentId

  const paths = await discoverAuthStorePaths({ openclawDir, agentId })
  const reports: MigrationFileReport[] = []

  for (const p of paths) {
    reports.push(
      await migrateAuthStoreFile(p.agentId, p.authStorePath, {
        dryRun: options?.dryRun,
        includeOAuth: options?.includeOAuth,
        prefix: options?.prefix,
        backup: options?.backup,
        profileEnvVarMap: options?.profileEnvVarMap,
        storage: options?.storage
      })
    )
  }
  return reports
}
