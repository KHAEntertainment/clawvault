import { Command } from 'commander'
import chalk from 'chalk'
import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import { discoverAuthStorePaths, type DiscoverAuthStoresOptions } from '../../openclaw/migrate.js'

interface CleanupOptions {
  openclawDir?: string
  agentId?: string
  audit?: boolean
  consolidate?: boolean
  apply?: boolean
  verbose?: boolean
}

interface ProfileFingerprint {
  agentId: string
  authStorePath: string
  profileId: string
  provider: string
  fingerprint: string
  hasKey: boolean
  keyHash?: string
}

interface RedundancyReport {
  sharedProfiles: Array<{
    fingerprint: string
    count: number
    agents: string[]
    provider: string
  }>
  agentsWithNoUniqueProfiles: string[]
  globalProviderCandidates: Array<{
    provider: string
    agents: string[]
    profileIds: string[]
  }>
}

/**
 * Compute a fingerprint for a credential profile based on provider and key hash.
 * Only api_key and token types are included.
 */
function fingerprintProfile(
  agentId: string,
  authStorePath: string,
  profileId: string,
  credential: Record<string, unknown>
): ProfileFingerprint | null {
  const type = credential.type as string | undefined
  if (type !== 'api_key' && type !== 'token') {
    return null
  }

  const provider = (credential.provider as string) || profileId.split(':')[0]
  const keyField = type === 'api_key' ? 'key' : 'token'
  const keyValue = credential[keyField]

  let keyHash: string | undefined
  let hasKey = false

  if (typeof keyValue === 'string' && keyValue.trim() !== '' && !keyValue.startsWith('${')) {
    hasKey = true
    keyHash = createHash('sha256').update(keyValue).digest('hex').slice(0, 16)
  }

  const fingerprint = createHash('sha256')
    .update(`${type}:${provider}:${keyHash || 'placeholder'}`)
    .digest('hex')
    .slice(0, 16)

  return {
    agentId,
    authStorePath,
    profileId,
    provider,
    fingerprint,
    hasKey,
    keyHash,
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  const data = await fs.readFile(path, 'utf-8')
  return JSON.parse(data)
}

export async function analyzeAuthStoreRedundancies(
  options?: DiscoverAuthStoresOptions
): Promise<RedundancyReport> {
  const paths = await discoverAuthStorePaths(options)

  const allProfiles: ProfileFingerprint[] = []

  for (const { agentId, authStorePath } of paths) {
    try {
      const root = await readJsonFile(authStorePath)
      if (typeof root !== 'object' || root === null) continue

      const store = root as Record<string, unknown>
      const profilesUnknown = store.profiles
      if (typeof profilesUnknown !== 'object' || profilesUnknown === null) continue

      const profiles = profilesUnknown as Record<string, unknown>

      for (const [profileId, credentialUnknown] of Object.entries(profiles)) {
        if (typeof credentialUnknown !== 'object' || credentialUnknown === null) continue
        const fingerprint = fingerprintProfile(agentId, authStorePath, profileId, credentialUnknown as Record<string, unknown>)
        if (fingerprint) {
          allProfiles.push(fingerprint)
        }
      }
    } catch {
      // ignore errors
    }
  }

  // Find shared profiles (same fingerprint across multiple agents)
  const fingerprintGroups = new Map<string, ProfileFingerprint[]>()
  for (const profile of allProfiles) {
    if (!profile.hasKey) continue // Skip placeholder-only profiles
    const existing = fingerprintGroups.get(profile.fingerprint) || []
    existing.push(profile)
    fingerprintGroups.set(profile.fingerprint, existing)
  }

  const sharedProfiles: RedundancyReport['sharedProfiles'] = []
  for (const [fingerprint, profiles] of fingerprintGroups) {
    const agentIds = new Set(profiles.map(p => p.agentId))
    if (agentIds.size > 1) {
      const provider = profiles[0].provider
      sharedProfiles.push({
        fingerprint,
        count: agentIds.size,
        agents: Array.from(agentIds),
        provider,
      })
    }
  }

  // Find agents with no unique profiles (all their profiles are shared)
  const agentsWithProfiles = new Set(allProfiles.filter(p => p.hasKey).map(p => p.agentId))
  const agentsWithSharedOnly = new Set<string>()

  for (const agentId of agentsWithProfiles) {
    const agentProfiles = allProfiles.filter(p => p.agentId === agentId && p.hasKey)
    if (agentProfiles.length === 0) continue

    const allFingerprints = agentProfiles.map(p => p.fingerprint)
    const sharedCount = allFingerprints.filter(fp => {
      const group = fingerprintGroups.get(fp)
      if (!group) return false
      const agentIds = new Set(group.map(p => p.agentId))
      return agentIds.size > 1
    }).length

    // If ALL of an agent's profiles are shared with others, it's a candidate for cleanup
    if (sharedCount === agentProfiles.length && agentProfiles.length > 0) {
      agentsWithSharedOnly.add(agentId)
    }
  }

  // Find global provider candidates (same provider+fingerprint used by all agents)
  const providerFingerprintAgents = new Map<string, Set<string>>()
  const providerFingerprintProfileIds = new Map<string, string[]>()
  const providerFingerprintProvider = new Map<string, string>()

  for (const profile of allProfiles.filter(p => p.hasKey)) {
    const key = `${profile.provider}|${profile.fingerprint}`
    const agents = providerFingerprintAgents.get(key) || new Set()
    agents.add(profile.agentId)
    providerFingerprintAgents.set(key, agents)

    const profileIds = providerFingerprintProfileIds.get(key) || []
    profileIds.push(profile.profileId)
    providerFingerprintProfileIds.set(key, profileIds)

    providerFingerprintProvider.set(key, profile.provider)
  }

  const allAgentIds = [...agentsWithProfiles]
  const globalProviderCandidates: RedundancyReport['globalProviderCandidates'] = []

  for (const [key, agents] of providerFingerprintAgents) {
    if (agents.size === allAgentIds.length && allAgentIds.length > 1) {
      globalProviderCandidates.push({
        provider: providerFingerprintProvider.get(key)!,
        agents: [...agents],
        profileIds: [...new Set(providerFingerprintProfileIds.get(key) || [])],
      })
    }
  }

  return {
    sharedProfiles,
    agentsWithNoUniqueProfiles: [...agentsWithSharedOnly],
    globalProviderCandidates,
  }
}

export const cleanupCommand = new Command('cleanup')
  .description('Detect and report redundant auth configurations across agents')
  .option('--openclaw-dir <path>', 'OpenClaw root directory (default: ~/.openclaw)')
  .option('--agent-id <id>', 'Only analyze a single agent by id')
  .option('--audit', 'Output detailed audit report (no changes)')
  .option('--consolidate', 'Generate a plan to consolidate to global providers')
  .option('--apply', 'Apply the consolidation plan (requires --consolidate)')
  .option('--verbose', 'Print detailed information')
  .action(async (options: CleanupOptions) => {
    try {
      if (options.apply) {
        console.log(chalk.yellow('Warning: --apply is not yet implemented'))
        console.log(chalk.gray('To consolidate auth configurations:'))
        console.log(chalk.gray('  1. Generate a migration plan: clawvault openclaw migrate --plan'))
        console.log(chalk.gray('  2. Apply via OpenClaw: openclaw secrets apply --from clawvault-migration-plan.json'))
        console.log(chalk.gray('  3. Review and remove redundant auth-profiles.json files after confirming agents can access shared secrets'))
        console.log(chalk.gray('  4. Restart the gateway: openclaw gateway restart'))
        return
      }

      const report = await analyzeAuthStoreRedundancies({
        openclawDir: options.openclawDir,
        agentId: options.agentId,
      })

      if (options.audit) {
        // Detailed audit report
        console.log(chalk.bold('Auth Configuration Audit Report'))
        console.log(chalk.gray('='.repeat(50)))

        if (report.sharedProfiles.length > 0) {
          console.log(chalk.green(`\nShared Profiles (${report.sharedProfiles.length}):`))
          for (const shared of report.sharedProfiles) {
            console.log(`  ${chalk.cyan(shared.provider)} (${shared.count} agents)`)
            console.log(`    Agents: ${shared.agents.join(', ')}`)
            if (options.verbose) {
              console.log(`    Fingerprint: ${shared.fingerprint}`)
            }
          }
        }

        if (report.agentsWithNoUniqueProfiles.length > 0) {
          console.log(chalk.yellow(`\nAgents with no unique profiles (${report.agentsWithNoUniqueProfiles.length}):`))
          console.log('  These agents only have profiles that are duplicated across other scanned agents:')
          for (const agentId of report.agentsWithNoUniqueProfiles) {
            console.log(`    - ${agentId}`)
          }
        }

        if (report.globalProviderCandidates.length > 0) {
          console.log(chalk.green(`\nGlobal Provider Candidates (${report.globalProviderCandidates.length}):`))
          console.log('  These providers are used by ALL agents and could be consolidated:')
          for (const candidate of report.globalProviderCandidates) {
            console.log(`  ${chalk.cyan(candidate.provider)}`)
            console.log(`    Agents: ${candidate.agents.join(', ')}`)
            if (options.verbose) {
              console.log(`    Profile IDs: ${candidate.profileIds.join(', ')}`)
            }
          }
        }

        if (report.sharedProfiles.length === 0 && report.agentsWithNoUniqueProfiles.length === 0 && report.globalProviderCandidates.length === 0) {
          console.log(chalk.green('\nNo redundancy issues found.'))
        }

        return
      }

      if (options.consolidate) {
        // Generate consolidation plan
        console.log(chalk.bold('Consolidation Plan'))
        console.log(chalk.gray('='.repeat(50)))

        if (report.globalProviderCandidates.length > 0) {
          console.log(chalk.green('\nRecommended global providers:'))
          for (const candidate of report.globalProviderCandidates) {
            console.log(`  ${chalk.cyan(candidate.provider)}`)
            console.log(`    Current profiles: ${candidate.profileIds.length}`)
            console.log(`    Used by: ${candidate.agents.length} agents`)
            console.log(`    Action: Convert to global provider with exec refs`)
          }
        }

        if (report.agentsWithNoUniqueProfiles.length > 0) {
          console.log(chalk.yellow('\nAgents with only duplicated profiles:'))
          for (const agentId of report.agentsWithNoUniqueProfiles) {
            console.log(`  - ${agentId}`)
          }
          console.log(chalk.gray('    Action: Review if these agents still need their own auth-profiles.json'))
        }

        if (report.sharedProfiles.length > 0) {
          console.log(chalk.green('\nDuplicate profiles that could be deduplicated:'))
          for (const shared of report.sharedProfiles) {
            console.log(`  ${chalk.cyan(shared.provider)}: ${shared.count} copies`)
            console.log(`    Agents: ${shared.agents.join(', ')}`)
          }
        }

        console.log('')
        console.log('To apply this consolidation plan:')
        console.log('  1. Generate a migration plan: clawvault openclaw migrate --plan')
        console.log('  2. Apply via OpenClaw: openclaw secrets apply --from clawvault-migration-plan.json')
        console.log('  3. Review and remove redundant auth-profiles.json files after confirming agents can access shared secrets')
        console.log('  4. Restart the gateway: openclaw gateway restart')

        return
      }

      // Default: brief summary
      console.log(chalk.bold('Auth Configuration Summary'))
      console.log(chalk.gray('='.repeat(50)))
      console.log(chalk.gray(`Shared profiles: ${report.sharedProfiles.length}`))
      console.log(chalk.gray(`Agents with no unique profiles: ${report.agentsWithNoUniqueProfiles.length}`))
      console.log(chalk.gray(`Global provider candidates: ${report.globalProviderCandidates.length}`))

      if (report.sharedProfiles.length > 0 || report.agentsWithNoUniqueProfiles.length > 0 || report.globalProviderCandidates.length > 0) {
        console.log('')
        console.log('Run with --audit for details or --consolidate to generate a plan.')
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      // eslint-disable-next-line no-console
      console.error(chalk.red(`Error: ${message}`))
      process.exitCode = 1
    }
  })