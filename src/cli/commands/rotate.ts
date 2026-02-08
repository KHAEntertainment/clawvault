/**
 * Rotate Secret Command
 *
 * Updates an existing secret with a new value.
 * Uses interactive password prompt for the new value.
 */

import { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { createStorage } from '../../storage/index.js'

interface RotateAnswers {
  newValue: string
  confirm: boolean
}

export const rotateCommand = new Command('rotate')
  .description('Rotate (update) a secret value')
  .argument('<name>', 'Secret name to rotate')
  .action(async (name: string) => {
    const storage = await createStorage()

    // Check if secret exists
    if (!(await storage.has(name))) {
      console.log(chalk.yellow(`Secret "${name}" does not exist.`))
      console.log(chalk.gray('Use "clawvault add" to create a new secret.'))
      return
    }

    // Interactive prompt for new value
    const answers = await inquirer.prompt<RotateAnswers>([
      {
        type: 'password',
        name: 'newValue',
        message: `Enter new value for ${chalk.cyan(name)}:`,
        mask: '*',
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'Secret value cannot be empty'
          }
          return true
        }
      },
      {
        type: 'confirm',
        name: 'confirm',
        message: `Update secret "${chalk.cyan(name)}"?`,
        default: true
      }
    ])

    if (!answers.confirm) {
      console.log(chalk.gray('Cancelled.'))
      return
    }

    try {
      // Update the secret with new value
      await storage.set(name, answers.newValue)
      console.log(chalk.green(`Secret "${name}" rotated successfully.`))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.log(chalk.red(`Failed to rotate secret: ${message}`))
      process.exit(1)
    }
  })
