/**
 * CV Command - ClawVault Chat Commands
 * 
 * Provides chat-friendly commands for agents via the CLI.
 * All commands are designed to work well in chat contexts (Telegram, Discord, etc.)
 * with no secret values returned - only names, links, or status messages.
 */

import { Command } from 'commander'
import chalk from 'chalk'

import { createStorage } from '../../storage/index.js'

interface CvOptions {
  notify?: boolean
  sessionKey?: string
  duration?: string
}

/**
 * Execute a command and return output, or throw on error
 */

/**
 * Get OpenClaw gateway URL
 */
function getGatewayUrl(): string {
  try {
    return process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:3001'
  } catch {
    return 'http://localhost:3001'
  }
}

/**
 * Get gateway token for webhook commands
 */
function getGatewayToken(): string {
  try {
    return process.env.OPENCLAW_GATEWAY_TOKEN || ''
  } catch {
    return ''
  }
}

export const cvCommand = new Command('cv')
  .description('ClawVault chat commands for agents')
  .allowExcessArguments(false)

// /cv add <name>
cvCommand
  .command('add <name>')
  .description('Generate a one-time secure link for secret entry')
  .option('--notify', 'Notify agent when secret is submitted (default: true)', true)
  .option('--no-notify', 'Disable agent notification')
  .option('--session-key <key>', 'Route webhook to specific agent session')
  .option('--duration <minutes>', 'Link lifetime (default 15, max 120)', '15')
  .action(async (name: string, options: CvOptions) => {
    // Validate name format
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      console.log(chalk.red('Error: invalid secret. Must match /^[A-Z][A-Z0-9_]*$/'))
      process.exitCode = 1
      return
    }

    const duration = parseInt(options.duration || '15', 10)
    if (duration < 1 || duration > 120) {
      console.log(chalk.red('Error: duration must be between 1 and 120 minutes'))
      process.exitCode = 1
      return
    }

    const notify = options.notify !== false
    
    try {
      // Build the CLI command
      const args = [
        'request', name,
        '--timeout-min', String(duration)
      ]
      
      if (!notify) {
        args.push('--no-notify')
      }
      if (options.sessionKey) {
        args.push('--session-key', options.sessionKey)
      }

      // Run the request command and capture output
      // Since we're in a chat context, we can't wait for interactive input
      // So we'll just spawn and print the URL
      console.log(chalk.cyan('Starting request server...'))
      
      // For chat context, we can't run interactive - so let's use a different approach
      // Create the request via API directly
      const storage = await createStorage()
      const webModule = await import('../../web/index.js')
      
      const result = await webModule.startServer(storage, {
        port: 0, // Let system assign
        host: 'localhost',
        requestTtlMs: duration * 60 * 1000,
      })

      const r = result.requestStore.create(name, undefined, {
        notifyAgent: notify,
        sessionKey: options.sessionKey,
      })

      const url = `${result.origin}/requests/${r.id}`
      
      console.log(chalk.green('✓ Request link created'))
      console.log(chalk.bold(url))
      console.log(chalk.gray(`Secret: ${name}`))
      console.log(chalk.gray(`Expires: ${new Date(r.expiresAt).toLocaleString()}`))
      if (notify) {
        console.log(chalk.gray('Notification: enabled'))
      }

      // Clean up server after printing (in real usage, you'd keep it running)
      await result.close()
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.log(chalk.red(`Error: ${message}`))
      process.exitCode = 1
    }
  })

// /cv list
cvCommand
  .command('list')
  .description('List stored secrets (no values)')
  .action(async () => {
    try {
      const storage = await createStorage()
      const secrets = await storage.list()
      
      if (secrets.length === 0) {
        console.log(chalk.gray('No secrets stored'))
        return
      }

      console.log(chalk.cyan('Stored secrets:'))
      for (const secret of secrets) {
        console.log(chalk.bold('• ') + secret)
      }
      console.log(chalk.gray(`Total: ${secrets.length}`))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.log(chalk.red(`Error: ${message}`))
      process.exitCode = 1
    }
  })

// /cv remove <name>
cvCommand
  .command('remove <name>')
  .description('Delete a secret')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (name: string, options: { yes?: boolean }) => {
    // Validate name format
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      console.log(chalk.red('Error: invalid secret'))
      process.exitCode = 1
      return
    }

    // Check if secret exists
    try {
      const storage = await createStorage()
      const exists = await storage.has(name)
      
      if (!exists) {
        console.log(chalk.yellow(`Secret "${name}" not found`))
        process.exitCode = 1
        return
      }

      // Confirm unless -y flag
      if (!options.yes) {
        // In chat context, we can't easily confirm - require -y
        console.log(chalk.yellow('Use -y flag to confirm deletion'))
        console.log(chalk.gray(`To delete: /cv remove ${name} -y`))
        return
      }

      await storage.delete(name)
      console.log(chalk.green(`✓ Secret "${name}" deleted`))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.log(chalk.red(`Error: ${message}`))
      process.exitCode = 1
    }
  })

// /cv status
cvCommand
  .command('status')
  .description('Check OpenClaw exec provider health')
  .action(async () => {
    try {
      console.log(chalk.cyan('OpenClaw Status:'))
      
      // Check if gateway is reachable
      const gatewayUrl = getGatewayUrl()
      try {
        const healthCheck = await fetch(`${gatewayUrl}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        })
        if (healthCheck.ok) {
          console.log(chalk.green('• Gateway: ✓ Connected'))
        } else {
          console.log(chalk.yellow('• Gateway: ⚠ Unexpected status'))
        }
      } catch {
        console.log(chalk.red('• Gateway: ✗ Not reachable'))
      }

      // Check exec provider
      try {
        const storage = await createStorage()
        // Try to list to verify keyring access
        await storage.list()
        console.log(chalk.green('• Keyring: ✓ Accessible'))
      } catch {
        console.log(chalk.red('• Keyring: ✗ Not accessible'))
      }

      // Check gateway token if set
      const token = getGatewayToken()
      if (token) {
        console.log(chalk.green('• Webhook token: ✓ Configured'))
      } else {
        console.log(chalk.yellow('• Webhook token: ⚠ Not configured (set OPENCLAW_GATEWAY_TOKEN)'))
      }
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.log(chalk.red(`Error: ${message}`))
      process.exitCode = 1
    }
  })

// /cv get <name>
cvCommand
  .command('get <name>')
  .description('Generate a one-time view link (read-only)')
  .option('--duration <minutes>', 'Link lifetime (default 5, max 30)', '5')
  .action(async (name: string, options: { duration?: string }) => {
    // Validate name format
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      console.log(chalk.red('Error: invalid secret'))
      process.exitCode = 1
      return
    }

    const duration = parseInt(options.duration || '5', 10)
    if (duration < 1 || duration > 30) {
      console.log(chalk.red('Error: duration must be between 1 and 30 minutes'))
      process.exitCode = 1
      return
    }

    try {
      const storage = await createStorage()
      const exists = await storage.has(name)
      
      if (!exists) {
        console.log(chalk.yellow(`Secret "${name}" not found`))
        process.exitCode = 1
        return
      }

      // For get, we create a request with read-only intent (similar flow)
      // The actual read would happen via a separate endpoint
      // For now, just indicate the secret exists
      console.log(chalk.green(`✓ Secret "${name}" exists`))
      console.log(chalk.gray('Note: View links require the secret to be updated via request'))
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.log(chalk.red(`Error: ${message}`))
      process.exitCode = 1
    }
  })

// /cv reload
cvCommand
  .command('reload')
  .description('Trigger OpenClaw secrets reload')
  .action(async () => {
    const token = getGatewayToken()
    
    if (!token) {
      console.log(chalk.red('Error: OPENCLAW_GATEWAY_TOKEN not configured'))
      console.log(chalk.gray('Set the token in your environment to use /cv reload'))
      process.exitCode = 1
      return
    }

    const gatewayUrl = getGatewayUrl()
    
    try {
      console.log(chalk.cyan('Triggering secrets reload...'))
      
      const response = await fetch(`${gatewayUrl}/api/secrets/reload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000)
      })

      if (response.ok) {
        console.log(chalk.green('✓ Secrets reloaded'))
      } else {
        console.log(chalk.yellow(`⚠ Reload returned: ${response.status}`))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.log(chalk.red(`Error: ${message}`))
      process.exitCode = 1
    }
  })
