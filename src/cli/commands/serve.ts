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
  allowInsecureHttp?: boolean
}

export const serveCommand = new Command('serve')
  .description('Start web UI server for secret submission')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('-H, --host <host>', 'Host address', 'localhost')
  .option('--tls', 'Enable HTTPS')
  .option('--cert <path>', 'TLS certificate path')
  .option('--key <path>', 'TLS key path')
  .option('--allow-insecure-http', 'Allow binding non-localhost over HTTP (strongly discouraged)', false)
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

    // Policy: refuse insecure HTTP on non-localhost unless Tailscale or explicit override.
    if (!options.tls) {
      const policy = webModule.decideInsecureHttpPolicy(options.host, options.allowInsecureHttp ?? false)
      if (!policy.allow) {
        console.log(chalk.red('Refusing to start: binding a secret-submission server to a non-localhost address over HTTP is unsafe.'))
        console.log(chalk.gray('Use Tailscale (recommended) or enable TLS via --tls --cert --key.'))
        console.log(chalk.gray('To override (strongly discouraged), pass --allow-insecure-http.'))
        process.exit(1)
      }

      if (policy.reason === 'tailscale') {
        console.log('')
        console.log(chalk.yellow('WARNING: Binding over HTTP on a Tailscale address.'))
        console.log(chalk.gray('This is acceptable on a private tailnet, but TLS is still recommended when possible.'))
        console.log('')
      }

      if (policy.reason === 'override') {
        console.log('')
        console.log(chalk.red('╔══════════════════════════════════════════════════════════════╗'))
        console.log(chalk.red('║  DANGEROUS: Insecure HTTP enabled (non-localhost binding)    ║'))
        console.log(chalk.red('║  Anyone on the network can submit secrets to your keyring.   ║'))
        console.log(chalk.red('║  Strongly recommended: use Tailscale or enable TLS.          ║'))
        console.log(chalk.red('╚══════════════════════════════════════════════════════════════╝'))
        console.log(chalk.gray('If you do not have Tailscale installed, install it before using remote secret submission.'))
        console.log('')
      }
    } else if (!webModule.isLocalhostBinding(options.host)) {
      console.log('')
      console.log(chalk.yellow('Binding to a non-localhost address with TLS enabled.'))
      console.log(chalk.gray('Ensure your certificate is valid and the host is not exposed unintentionally.'))
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
        }),
        allowInsecureHttp: options.allowInsecureHttp ?? false,
      })

      console.log('')
      console.log(chalk.green(`Server running at ${result.origin}`))
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
