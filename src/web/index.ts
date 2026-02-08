/**
 * ClawVault Web UI Server
 *
 * Provides an Express-based web interface for submitting secrets directly
 * to the encrypted keyring. Secrets bypass AI context entirely.
 *
 * Security features:
 * - Binds to localhost by default
 * - HTTPS support via --tls flag
 * - Secrets submitted directly to keyring
 * - Responses never contain secret values
 */

import express, { type Request, Response, NextFunction } from 'express'
import { type StorageProvider } from '../storage/index.js'
import { join } from 'path'
import { submitSecret } from './routes/submit.js'
import { statusRoute } from './routes/status.js'

/**
 * Web server configuration options
 */
export interface WebServerOptions {
  /** Port to listen on (default: 3000) */
  port: number
  /** Host to bind to (default: 'localhost') */
  host: string
  /** Optional TLS configuration for HTTPS */
  tls?: {
    /** Path to TLS certificate file */
    cert: string
    /** Path to TLS private key file */
    key: string
  }
}

/**
 * Create and configure the Express application
 *
 * @param storage - Storage provider instance
 * @param options - Server configuration options
 * @returns Configured Express app
 */
export async function createServer(
  storage: StorageProvider,
  _options: WebServerOptions
): Promise<express.Application> {
  const app = express()

  // Middleware for parsing request bodies
  app.use(express.urlencoded({ extended: true }))
  app.use(express.json())

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-XSS-Protection', '1; mode=block')
    next()
  })

  // API Routes
  app.post('/api/submit', (req: Request, res: Response) => submitSecret(req, res, storage))
  app.get('/api/status', (req: Request, res: Response) => statusRoute(req, res, storage))

  // Serve the main form
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, 'routes', 'templates', 'form.html'))
  })

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() })
  })

  return app
}

/**
 * Start the web server
 *
 * @param storage - Storage provider instance
 * @param options - Server configuration options
 */
export async function startServer(
  storage: StorageProvider,
  options: WebServerOptions
): Promise<void> {
  const app = await createServer(storage, options)

  if (options.tls) {
    // HTTPS with TLS
    const https = await import('https')
    const fs = await import('fs')

    const server = https.createServer(
      {
        cert: fs.readFileSync(options.tls.cert),
        key: fs.readFileSync(options.tls.key)
      },
      app
    )

    return new Promise<void>((resolve, reject) => {
      server.listen(options.port, options.host, () => {
        resolve()
      })
      server.on('error', reject)
    })
  } else {
    // HTTP (default, localhost only)
    const server = app.listen(options.port, options.host)
    return new Promise<void>((resolve, reject) => {
      server.on('listening', () => resolve())
      server.on('error', reject)
    })
  }
}
