/**
 * Add Secret Command
 *
 * Adds a new secret to the keyring with interactive password prompt.
 * Never logs secret values or exposes them in error messages.
 */

import { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { createStorage } from '../../storage/index.js'
import { loadConfig } from '../../config/index.js'
import { ConfigSchema } from '../../config/schemas.js'

interface AddOptions {
  provider?: string
  env?: string
}

interface AddAnswers {
  value: string
  description?: string
}

/**
 * Check if a secret name is defined in the config.
 */
function isSecretInConfig(name: string, config: ConfigSchema): boolean {
  return name in config.secrets
}

/**
 * Get the secret definition from config or create default.
 */
function getSecretDefinition(name: string, config: ConfigSchema, options: AddOptions): ConfigSchema['secrets'][string] {
  if (isSecretInConfig(name, config)) {
    return config.secrets[name]
  }

  // Create default definition for new secrets
  return {
    description: `${name} - managed via CLI`,
    environmentVar: options.env || name,
    provider: options.provider || 'custom',
    required: false,
    gateways: ['main']
  }
}

export const addCommand = new Command('add')
  .description('Add a new secret to the keyring')
  .argument('<name>', 'Secret name (e.g., OPENAI_API_KEY)')
  .option('-p, --provider <provider>', 'Service provider (e.g., openai, anthropic)')
  .option('-e, --env <var>', 'Environment variable name (defaults to secret name)')
  .action(async (name: string, options: AddOptions) => {
    const storage = await createStorage()

    // Check if secret already exists in keyring
    if (await storage.has(name)) {
      console.log(chalk.yellow(`Secret "${name}" already exists in keyring.`))
      console.log(chalk.gray('Use "clawvault rotate" to update its value.'))
      return
    }

    // Load config to check if this is a known secret type
    const config = await loadConfig()
    const definition = getSecretDefinition(name, config, options)

    // Interactive prompt for secret value (hidden input)
    const answers = await inquirer.prompt<AddAnswers>([
      {
        type: 'input',
        name: 'description',
        message: 'Description:',
        default: definition.description,
        when: !isSecretInConfig(name, config)
      },
      {
        type: 'password',
        name: 'value',
        message: `Enter value for ${chalk.cyan(name)}:`,
        mask: '*',
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'Secret value cannot be empty'
          }
          return true
        }
      }
    ])

    try {
      // Store the secret in the keyring
      await storage.set(name, answers.value)

      console.log(chalk.green(`Secret "${name}" stored successfully.`))
      console.log(chalk.gray(`Provider: ${definition.provider}`))
      console.log(chalk.gray(`Environment variable: ${definition.environmentVar}`))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      // Never include secret value in error messages
      console.log(chalk.red(`Failed to store secret "${name}": ${message}`))
      process.exit(1)
    }
  })
