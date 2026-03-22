/**
 * OpenClaw SecretsApplyPlan types and utilities.
 *
 * These types define the structure for plan files compatible with
 * `openclaw secrets apply --from <plan.json>`.
 */

export interface SecretsApplyPlan {
  version: 1
  protocolVersion: 1
  generatedAt: string
  generatedBy: string
  targets: SecretsApplyTarget[]
  providerUpserts?: Record<string, ProviderUpsert>
  options?: SecretsApplyOptions
}

export interface SecretsApplyTarget {
  type: 'auth-profiles.api_key.key' | 'auth-profiles.token.token'
  path: string
  pathSegments: string[]
  agentId: string
  ref: SecretRef
}

export interface SecretRef {
  source: 'exec'
  provider: string
  id: string
}

export interface ProviderUpsert {
  source: 'exec'
  command: string[]
  jsonOnly?: boolean
  passEnv?: string[]
}

export interface SecretsApplyOptions {
  scrubEnv?: boolean
  scrubAuthProfilesForProviderTargets?: boolean
  scrubLegacyAuthJson?: boolean
}

/**
 * Credential types that CAN be migrated via exec provider refs.
 */
export const MIGRATABLE_CREDENTIAL_TYPES = ['api_key', 'token'] as const
export type MigratableCredentialType = (typeof MIGRATABLE_CREDENTIAL_TYPES)[number]

/**
 * Credential types that CANNOT be migrated via exec provider refs.
 * OAuth tokens are runtime-minted and rotating, so they don't support SecretRef.
 */
export const NON_MIGRATABLE_CREDENTIAL_TYPES = ['oauth'] as const
export type NonMigratableCredentialType = (typeof NON_MIGRATABLE_CREDENTIAL_TYPES)[number]

/**
 * Information about a single secret that CAN be migrated.
 */
export interface MigratableSecret {
  agentId: string
  authStorePath: string
  profileId: string
  provider: string
  field: string
  secretId: string // The exec provider ID, e.g., "providers/openai/key"
  length: number
}

/**
 * Information about a secret that CANNOT be migrated.
 */
export interface NonMigratableSecret {
  agentId: string
  authStorePath: string
  profileId: string
  provider: string
  field: string
  reason: NonMigrationReason
}

export type NonMigrationReason =
  | 'oauth_not_supported'
  | 'unsupported_credential_type'
  | 'missing_value'
  | 'empty_value'
  | 'already_has_ref'

/**
 * Result of analyzing all auth stores for migration.
 */
export interface PlanAnalysis {
  migratable: MigratableSecret[]
  nonMigratable: NonMigratableSecret[]
  totalAgents: number
  agentsWithMigratable: number
  agentsWithNonMigratable: number
}

/**
 * Build the exec provider ID for a secret.
 * Format: providers/<provider>/<field>
 * Must match pattern: ^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$
 */
export function buildExecProviderId(provider: string, field: string): string {
  const sanitizedProvider = provider.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
  const sanitizedField = field.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed'
  return `providers/${sanitizedProvider}/${sanitizedField}`
}

/**
 * Build the path for a target in auth-profiles.json.
 * Format: profiles.<profileId>.<field>
 */
export function buildAuthProfilePath(profileId: string, field: string): string {
  return `profiles.${profileId}.${field}`
}

/**
 * Parse a profileId to extract provider and profile name.
 * E.g., "openai:default" -> { provider: "openai", profile: "default" }
 */
export function parseProfileId(profileId: string): { provider: string; profile: string } {
  const colonIdx = profileId.indexOf(':')
  if (colonIdx === -1) {
    return { provider: profileId, profile: profileId }
  }
  return {
    provider: profileId.slice(0, colonIdx),
    profile: profileId.slice(colonIdx + 1),
  }
}

/**
 * Create a SecretsApplyPlan from analyzed secrets.
 */
export function createSecretsApplyPlan(
  analysis: PlanAnalysis,
  options: {
    providerName?: string
    clawvaultPath?: string
  } = {}
): SecretsApplyPlan {
  const providerName = options.providerName ?? 'clawvault'
  const clawvaultPath = options.clawvaultPath ?? 'clawvault'

  const targets: SecretsApplyTarget[] = analysis.migratable.map(secret => ({
    type: secret.field === 'key' ? 'auth-profiles.api_key.key' : 'auth-profiles.token.token',
    path: buildAuthProfilePath(secret.profileId, secret.field),
    pathSegments: buildAuthProfilePath(secret.profileId, secret.field).split('.'),
    agentId: secret.agentId,
    ref: {
      source: 'exec',
      provider: providerName,
      id: secret.secretId,
    },
  }))

  const providerUpserts: Record<string, ProviderUpsert> = {
    [providerName]: {
      source: 'exec',
      command: [clawvaultPath, 'resolve'],
      jsonOnly: true,
    },
  }

  return {
    version: 1,
    protocolVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: 'clawvault',
    targets,
    providerUpserts,
    options: {
      scrubAuthProfilesForProviderTargets: true,
      scrubLegacyAuthJson: true,
    },
  }
}

/**
 * Validate that an exec provider ID matches the required pattern.
 * Pattern: ^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$
 */
export function isValidExecProviderId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(id)
}