import { Command } from 'commander'
import chalk from 'chalk'
import { migrateAllOpenClawAuthStores } from '../../openclaw/migrate.js'

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

export const openclawMigrateCommand = new Command('migrate')
  .description('Migrate OpenClaw plaintext auth-profiles.json secrets into ClawVault keyring and replace with ${ENV_VAR} placeholders')
  .option('--apply', 'Apply changes (default is dry-run)')
  .option('--openclaw-dir <path>', 'OpenClaw root directory (default: ~/.openclaw)')
  .option('--agent-id <id>', 'Only migrate a single agent by id')
  .option('--prefix <prefix>', 'Env var prefix', 'OPENCLAW')
  .option('--api-keys-only', 'Only migrate api_key credentials (skip OAuth)')
  .option('--no-backup', 'Do not create .bak backup files when applying')
  .option('--map <profileId=ENV_VAR>', 'Map an OpenClaw profileId to a specific env var name (api_key only)', collect, [])
  .option('--json', 'Output JSON report (metadata only)')
  .option('--verbose', 'Print per-secret actions (metadata only)')
  .action(async (options: OpenClawMigrateOptions) => {
    try {
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
