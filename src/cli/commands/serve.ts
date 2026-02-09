/**
 * Serve Command
 *
 * Starts the web UI server for secret submission.
 * Web UI allows submitting secrets directly to the keyring, bypassing AI context.
 *
 * Security notes (for agents troubleshooting):
 * - A one-time bearer token is generated and printed to the terminal.
 *   All API requests must include `Authorization: Bearer <token>`.
 * - Binding to any host other than localhost triggers a security warning
 *   because it exposes the secret-submission endpoint to the network.
 * - Rate limiting applies to /api/submit (30 req / 15 min).
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { createStorage } from '../../storage/index.js'

interface ServeOptions {
  port: string
  host: string
  tls?: boolean
  cert?: string
  key?: string
}

export const serveCommand = new Command('serve')
  .description('Start web UI server for secret submission')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('-H, --host <host>', 'Host address', 'localhost')
  .option('--tls', 'Enable HTTPS')
  .option('--cert <path>', 'TLS certificate path')
  .option('--key <path>', 'TLS key path')
  .action(async (options: ServeOptions) => {
    const port = parseInt(options.port, 10)

    if (options.tls && (!options.cert || !options.key)) {
      console.log(chalk.red('Error: --cert and --key are required when using --tls'))
      process.exit(1)
    }

    // Import web module before creating storage to avoid wasted work
    let webModule: Awaited<typeof import('../../web/index.js')>
    try {
      webModule = await import('../../web/index.js')
    } catch (error: unknown) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : ''

      if (code === 'ERR_MODULE_NOT_FOUND') {
        console.log('')
        console.log(chalk.yellow('Web UI module not found.'))
        console.log(chalk.gray('For now, use the CLI commands:'))
        console.log(chalk.gray(`  clawvault add <name>    - Add a secret`))
        console.log(chalk.gray(`  clawvault list          - List secrets`))
        console.log(chalk.gray(`  clawvault rotate <name> - Update a secret`))
        return
      }

      throw error
    }

    const storage = await createStorage()

    if (!webModule.isLocalhostBinding(options.host)) {
      console.log('')
      console.log(chalk.red('╔══════════════════════════════════════════════════════════════╗'))
      console.log(chalk.red('║  WARNING: Binding to a non-localhost address!               ║'))
      console.log(chalk.red('║  This exposes the secret-submission endpoint to the network. ║'))
      console.log(chalk.red('║  Only do this on a trusted, firewalled network.             ║'))
      console.log(chalk.red('╚══════════════════════════════════════════════════════════════╝'))
      console.log('')
    }

    console.log(chalk.cyan('ClawVault Web UI'))
    console.log(chalk.gray('Secrets are submitted directly to the encrypted keyring.'))
    console.log('')

    console.log(chalk.gray(`Starting server on ${options.host}:${port}`))

    try {
      const result = await webModule.startServer(storage, {
        port,
        host: options.host,
        ...(options.tls && {
          tls: {
            cert: options.cert!,
            key: options.key!
          }
        })
      })

      const protocol = options.tls ? 'https' : 'http'
      console.log('')
      console.log(chalk.green(`Server running at ${protocol}://${options.host}:${port}`))
      console.log('')
      console.log(chalk.yellow('API Bearer Token (include in Authorization header):'))
      console.log(chalk.bold(result.token))
      console.log('')
      console.log(chalk.gray('Press Ctrl+C to stop'))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.log(chalk.red(`Failed to start server: ${message}`))
      process.exit(1)
    }
  })
