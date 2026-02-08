/**
 * List Secrets Command
 *
 * Lists all secrets stored in the keyring.
 * NEVER shows secret values - only metadata (names, descriptions).
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { createStorage } from '../../storage/index.js'
import { loadConfig } from '../../config/index.js'

interface SecretMetadata {
  name: string
  description?: string
  provider?: string
  environmentVar?: string
}

export const listCommand = new Command('list')
  .description('List all secrets (metadata only, never values)')
  .action(async () => {
    const storage = await createStorage()
    const config = await loadConfig()

    // Get all secret names from keyring
    const secretNames = await storage.list()

    if (secretNames.length === 0) {
      console.log(chalk.yellow('No secrets stored.'))
      console.log(chalk.gray('Use "clawvault add <name>" to add a secret.'))
      return
    }

    // Build metadata list
    const secrets: SecretMetadata[] = secretNames.map(name => {
      const def = config.secrets[name]
      return {
        name,
        description: def?.description,
        provider: def?.provider,
        environmentVar: def?.environmentVar
      }
    })

    // Display secrets with metadata
    console.log(chalk.bold('Stored Secrets:'))
    console.log('')

    for (const secret of secrets) {
      console.log(`  ${chalk.cyan(secret.name)}`)
      if (secret.description) {
        console.log(`    ${chalk.gray('Description:')} ${secret.description}`)
      }
      if (secret.provider) {
        console.log(`    ${chalk.gray('Provider:')} ${secret.provider}`)
      }
      if (secret.environmentVar && secret.environmentVar !== secret.name) {
        console.log(`    ${chalk.gray('Environment:')} ${secret.environmentVar}`)
      }
    }

    console.log('')
    console.log(chalk.gray(`Total: ${secretNames.length} secret${secretNames.length === 1 ? '' : 's'}`))
  })
