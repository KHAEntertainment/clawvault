/**
 * Default Secret Templates
 *
 * Pre-defined secret templates for common services.
 * These are used when creating a default configuration
 * or when adding a secret from a template.
 *
 * IMPORTANT: This file contains only secret DEFINITIONS,
 * not actual secret values. Values are stored in the keyring.
 */

import { ConfigSchema } from './schemas.js'

/**
 * Default configuration with common API key templates.
 *
 * This configuration is created when no config file exists.
 * Users can add their own secret definitions via CLI.
 */
const defaultConfig: ConfigSchema = {
  version: 1,
  secrets: {
    OPENAI_API_KEY: {
      description: 'OpenAI API key for GPT models (GPT-4, GPT-3.5, etc.)',
      environmentVar: 'OPENAI_API_KEY',
      provider: 'openai',
      required: false,
      gateways: ['main'],
      validation: {
        pattern: '^sk-[a-zA-Z0-9]{48}$',
        minLength: 51,
        maxLength: 51
      }
    },
    ANTHROPIC_API_KEY: {
      description: 'Anthropic API key for Claude models',
      environmentVar: 'ANTHROPIC_API_KEY',
      provider: 'anthropic',
      required: false,
      gateways: ['main'],
      validation: {
        pattern: '^sk-ant-[a-zA-Z0-9_-]{95}$',
        minLength: 100,
        maxLength: 100
      }
    },
    GEMINI_API_KEY: {
      description: 'Google Gemini API key for Gemini models',
      environmentVar: 'GEMINI_API_KEY',
      provider: 'google',
      required: false,
      gateways: ['main'],
      validation: {
        minLength: 30
      }
    },
    DISCORD_BOT_TOKEN: {
      description: 'Discord bot token for bot commands and interactions',
      environmentVar: 'DISCORD_BOT_TOKEN',
      provider: 'discord',
      required: false,
      gateways: ['main'],
      validation: {
        pattern: '^[A-Za-z0-9_\\-.]{50,}$',
        minLength: 50
      }
    }
  },
  gateway: {
    restartOnUpdate: true,
    services: ['openclaw-gateway.service']
  }
}

/**
 * Get the default configuration.
 *
 * @returns The default ConfigSchema
 */
export function getDefaultConfig(): ConfigSchema {
  return defaultConfig
}

/**
 * Get a specific secret template by name.
 *
 * @param name - The secret name (e.g., 'OPENAI_API_KEY')
 * @returns The secret definition template or undefined
 */
export function getSecretTemplate(name: string): ConfigSchema['secrets'][string] | undefined {
  return defaultConfig.secrets[name]
}

/**
 * Get all available secret template names.
 *
 * @returns Array of secret template names
 */
export function getSecretTemplateNames(): string[] {
  return Object.keys(defaultConfig.secrets)
}

/**
 * Create a secret definition from a template name.
 *
 * Useful for CLI commands like:
 *   clawvault add MY_CUSTOM_KEY --template openai
 *
 * @param templateName - The template to use
 * @param customName - The custom name for the secret
 * @returns A new secret definition or null if template not found
 */
export function createFromTemplate(
  templateName: string,
  customName: string
): ConfigSchema['secrets'][string] | null {
  const template = defaultConfig.secrets[templateName]
  if (!template) {
    return null
  }

  return {
    ...template,
    environmentVar: customName,
    description: `${customName}: ${template.description}`
  }
}

export default defaultConfig
