import { Command } from 'commander'
import chalk from 'chalk'
import { writeFile } from 'fs/promises'
import { migrateAllOpenClawAuthStores, generateSecretsApplyPlan } from '../../openclaw/migrate.js'
import { createSecretsApplyPlan } from '../../openclaw/plan.js'

interface OpenClawMigrateOptions {
  apply?: boolean
  openclawDir?: string
  agentId?: string
  prefix: string
  apiKeysOnly?: boolean
  backup?: boolean
  map?: string[]
  json?: boolean
  verbose?: boolean
  plan?: boolean
  providerName?: string
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

function parseProfileMap(entries: string[] | undefined): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of entries ?? []) {
    const idx = entry.indexOf('=')
    if (idx <= 0 || idx === entry.length - 1) {
      throw new Error(`Invalid --map entry (expected profileId=ENV_VAR): ${entry}`)
    }
    const profileId = entry.slice(0, idx)
    const envVar = entry.slice(idx + 1)
    if (!/^[A-Z][A-Z0-9_]*$/.test(envVar)) {
      throw new Error(`Invalid env var in --map: ${envVar}`)
    }
    map[profileId] = envVar
  }
  return map
}

async function handlePlanGeneration(options: OpenClawMigrateOptions): Promise<void> {
  const analysis = await generateSecretsApplyPlan({
    openclawDir: options.openclawDir,
    agentId: options.agentId,
    providerName: options.providerName,
  })

  const plan = createSecretsApplyPlan(analysis, {
    providerName: options.providerName,
  })

  const outputPath = 'clawvault-migration-plan.json'
  await writeFile(outputPath, JSON.stringify(plan, null, 2), 'utf-8')

  console.log(chalk.green(`SecretsApplyPlan generated: ${outputPath}`))
  console.log(chalk.gray(`Agents scanned: ${analysis.totalAgents}`))
  console.log('')

  if (analysis.migratable.length > 0) {
    console.log(chalk.green(`Secrets that CAN be migrated via exec provider: ${analysis.migratable.length}`))
    if (options.verbose) {
      for (const secret of analysis.migratable) {
        console.log(`  ${chalk.cyan(secret.profileId)} (${secret.agentId})`)
        console.log(`    Provider: ${secret.provider}, Field: ${secret.field}`)
        console.log(`    Exec ID: ${chalk.green(secret.secretId)}`)
      }
    }
  }

  if (analysis.nonMigratable.length > 0) {
    console.log(chalk.yellow(`Secrets that CANNOT be migrated: ${analysis.nonMigratable.length}`))
    const oauthCount = analysis.nonMigratable.filter(s => s.reason === 'oauth_not_supported').length
    if (oauthCount > 0) {
      console.log(chalk.gray(`  - ${oauthCount} OAuth credentials (not supported by exec provider)`))
    }
    if (options.verbose) {
      for (const secret of analysis.nonMigratable) {
        const reasonText = secret.reason === 'oauth_not_supported'
          ? 'OAuth not supported via exec provider'
          : secret.reason
        console.log(`  ${chalk.cyan(secret.profileId)} (${secret.agentId}): ${chalk.gray(reasonText)}`)
      }
    }
  }

  console.log('')
  console.log('Next steps:')
  console.log(`  1. Review the plan: cat ${outputPath}`)
  console.log('  2. Dry-run: openclaw secrets apply --from ./clawvault-migration-plan.json --dry-run')
  console.log('  3. Apply: openclaw secrets apply --from ./clawvault-migration-plan.json')
  console.log('  4. For OAuth: Use openclaw models auth login --sync-siblings instead')
}

export const openclawMigrateCommand = new Command('migrate')
  .description('Migrate OpenClaw plaintext auth-profiles.json secrets via exec provider plan (recommended) or legacy ${ENV_VAR} substitution')
  .option('--apply', 'Apply changes (default is dry-run)')
  .option('--openclaw-dir <path>', 'OpenClaw root directory (default: ~/.openclaw)')
  .option('--agent-id <id>', 'Only migrate a single agent by id')
  .option('--prefix <prefix>', 'Env var prefix', 'OPENCLAW')
  .option('--api-keys-only', 'Only migrate api_key credentials (skip OAuth)')
  .option('--no-backup', 'Do not create .bak backup files when applying')
  .option('--map <profileId=ENV_VAR>', 'Map an OpenClaw profileId to a specific env var name (api_key only)', collect, [])
  .option('--json', 'Output JSON report (metadata only)')
  .option('--verbose', 'Print per-secret actions (metadata only)')
  .option('--plan', 'Generate a SecretsApplyPlan for openclaw secrets apply (recommended)')
  .option('--provider-name <name>', 'Exec provider name in plan file', 'clawvault')
  .action(async (options: OpenClawMigrateOptions) => {
    try {
      // Handle --plan mode (generate SecretsApplyPlan)
      if (options.plan) {
        await handlePlanGeneration(options)
        return
      }

      console.warn(
        'DEPRECATED: clawvault openclaw migrate without --plan is deprecated. Use --plan to generate a SecretsApplyPlan for `openclaw secrets apply`.'
      )

      const dryRun = !options.apply
      const includeOAuth = !options.apiKeysOnly
      const profileEnvVarMap = parseProfileMap(options.map)

      const reports = await migrateAllOpenClawAuthStores({
        dryRun,
        openclawDir: options.openclawDir,
        agentId: options.agentId,
        includeOAuth,
        prefix: options.prefix,
        backup: options.backup,
        profileEnvVarMap
      })

      if (options.json) {
        // Metadata only: reports intentionally do not include secret values
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(reports, null, 2))
        return
      }

      const scanned = reports.length
      const filesChanged = reports.filter(r => r.changed).length
      const totalChanges = reports.reduce((sum, r) => sum + r.changes.length, 0)

      if (dryRun) {
        console.log(chalk.yellow('OpenClaw migration (dry-run)'))
        console.log(chalk.gray('No secrets were written and no files were modified.'))
      } else {
        console.log(chalk.green('OpenClaw migration (apply)'))
      }

      console.log(chalk.gray(`Scanned: ${scanned} auth store file${scanned === 1 ? '' : 's'}`))
      console.log(chalk.gray(`Files changed: ${filesChanged}`))
      console.log(chalk.gray(`Secrets migrated: ${totalChanges}`))

      if (scanned === 0) {
        console.log(chalk.yellow('No auth-profiles.json files found.'))
        return
      }

      if (options.verbose) {
        for (const report of reports) {
          if (!report.changed) continue
          console.log('')
          console.log(chalk.bold(`${report.agentId}`))
          console.log(chalk.gray(report.authStorePath))
          for (const change of report.changes) {
            console.log(
              `  ${chalk.cyan(change.profileId)} ${chalk.gray(change.field)} → ${chalk.green(change.envVar)} ${chalk.gray(`(${change.length} chars)`)}`
            )
          }
        }
      }

      if (dryRun && totalChanges > 0) {
        console.log('')
        console.log(chalk.gray('Re-run with --apply to write secrets to the keyring and update auth-profiles.json.'))
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      // eslint-disable-next-line no-console
      console.error(chalk.red(`Error: ${message}`))
      process.exitCode = 1
    }
  })
