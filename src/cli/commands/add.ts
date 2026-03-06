/**
 * Add Secret Command
 *
 * Adds a new secret to the keyring with interactive password prompt.
 * Supports non-interactive mode via --stdin or --value flags.
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
  stdin?: boolean
  value?: string
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
    description: name + ' - managed via CLI',
    environmentVar: options.env || name,
    provider: options.provider || 'custom',
    required: false,
    gateways: ['main']
  }
}

/**
 * Validate secret name.
 * Returns true if valid, false otherwise.
 */
function isValidSecretName(name: string): boolean {
  if (!name || name.trim().length === 0) {
    return false
  }
  // Allow alphanumeric, underscores, hyphens, and forward slashes (for paths like providers/openai/apiKey)
  return /^[a-zA-Z0-9_\-/]+$/.test(name)
}

/**
 * Store a secret in the keyring.
 */
async function storeSecret(name: string, value: string, options: AddOptions): Promise<void> {
  const storage = await createStorage()

  // Check if secret already exists in keyring
  if (await storage.has(name)) {
    console.log(chalk.yellow('Secret "' + name + '" already exists in keyring.'))
    console.log(chalk.gray('Use "clawvault rotate" to update its value.'))
    return
  }

  // Load config to check if this is a known secret type
  const config = await loadConfig()
  const definition = getSecretDefinition(name, config, options)

  try {
    // Store the secret in the keyring
    await storage.set(name, value)

    console.log(chalk.green('Secret "' + name + '" stored successfully.'))
    console.log(chalk.gray('Provider: ' + definition.provider))
    console.log(chalk.gray('Environment variable: ' + definition.environmentVar))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    // Never include secret value in error messages
    console.log(chalk.red('Failed to store secret "' + name + '": ' + message))
    process.exit(1)
  }
}

/**
 * Run the add command with non-interactive options.
 * Exported for testing.
 */
export async function runAddCommand(
  name: string,
  options: AddOptions,
  processObj: { stdin: NodeJS.ReadableStream; stdout: NodeJS.WriteStream; stderr: NodeJS.WriteStream } = process
): Promise<void> {
  // Validate name
  if (!isValidSecretName(name)) {
    console.log(chalk.red('Invalid secret name: "' + name + '". Use alphanumeric characters, underscores, hyphens, and forward slashes.'))
    process.exit(1)
  }

  // Priority 1: --stdin flag
  if (options.stdin) {
    // Read JSON from stdin
    let input = ''
    
    return new Promise((resolve, reject) => {
      processObj.stdin.on('data', (chunk: Buffer) => {
        input += chunk.toString()
      })
      
      processObj.stdin.on('end', async () => {
        try {
          const parsed = JSON.parse(input)
          
          if (!parsed.name && parsed.name !== name) {
            // If name provided in JSON, use it; otherwise use argument
            if (!parsed.name) {
              console.log(chalk.red('Missing "name" field in stdin JSON'))
              process.exit(1)
            }
          }
          
          if (!parsed.value) {
            console.log(chalk.red('Missing "value" field in stdin JSON'))
            process.exit(1)
          }
          
          const secretName = parsed.name || name
          const secretValue = parsed.value
          
          await storeSecret(secretName, secretValue, options)
          resolve()
        } catch (error) {
          if (error instanceof SyntaxError) {
            console.log(chalk.red('Failed to parse stdin JSON: invalid JSON format'))
            process.exit(1)
          }
          reject(error)
        }
      })
      
      processObj.stdin.on('error', (error: Error) => {
        console.log(chalk.red('Failed to read stdin: ' + error.message))
        process.exit(1)
      })
    })
  }
  
  // Priority 2: --value flag
  if (options.value) {
    await storeSecret(name, options.value, options)
    return
  }
  
  // Priority 3: Interactive mode (default)
  const storage = await createStorage()

  // Check if secret already exists in keyring
  if (await storage.has(name)) {
    console.log(chalk.yellow('Secret "' + name + '" already exists in keyring.'))
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
      message: 'Enter value for ' + chalk.cyan(name) + ':',
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

    console.log(chalk.green('Secret "' + name + '" stored successfully.'))
    console.log(chalk.gray('Provider: ' + definition.provider))
    console.log(chalk.gray('Environment variable: ' + definition.environmentVar))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    // Never include secret value in error messages
    console.log(chalk.red('Failed to store secret "' + name + '": ' + message))
    process.exit(1)
  }
}

export const addCommand = new Command('add')
  .description('Add a new secret to the keyring')
  .argument('<name>', 'Secret name (e.g., OPENAI_API_KEY)')
  .option('-p, --provider <provider>', 'Service provider (e.g., openai, anthropic)')
  .option('-e, --env <var>', 'Environment variable name (defaults to secret name)')
  .option('-s, --stdin', 'Read secret from stdin as JSON (format: {"name": "...", "value": "..."})')
  .option('-v, --value <value>', 'Secret value (non-interactive mode)')
  .action(async (name: string, options: AddOptions) => {
    await runAddCommand(name, options)
  })
