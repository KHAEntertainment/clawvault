/**
 * Remove Secret Command
 *
 * Removes a secret from the keyring.
 * Requires confirmation unless --force is used.
 */

import { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { createStorage } from '../../storage/index.js'

interface RemoveOptions {
  force?: boolean
}

interface ConfirmAnswers {
  confirm: boolean
}

export const removeCommand = new Command('remove')
  .description('Remove a secret from the keyring')
  .argument('<name>', 'Secret name to remove')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (name: string, options: RemoveOptions) => {
    const storage = await createStorage()

    // Check if secret exists
    if (!(await storage.has(name))) {
      console.log(chalk.yellow(`Secret "${name}" does not exist.`))
      return
    }

    // Confirmation prompt (skip with --force)
    if (!options.force) {
      const answers = await inquirer.prompt<ConfirmAnswers>([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Remove secret "${chalk.cyan(name)}" from keyring?`,
          default: false
        }
      ])

      if (!answers.confirm) {
        console.log(chalk.gray('Cancelled.'))
        return
      }
    }

    try {
      await storage.delete(name)
      console.log(chalk.green(`Secret "${name}" removed.`))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.log(chalk.red(`Failed to remove secret: ${message}`))
      process.exit(1)
    }
  })
