/**
 * Status route handler
 *
 * Returns metadata about stored secrets only.
 * Never includes secret values in responses.
 *
 * Security: Only returns secret names and count, never values.
 */

import * as express from 'express'
import { type StorageProvider } from '../../storage/index.js'

type Request = express.Request
type Response = express.Response

/**
 * Secret metadata returned by status endpoint
 */
interface SecretMetadata {
  name: string
}

/**
 * Status response schema
 */
interface StatusResponse {
  status: string
  secrets: SecretMetadata[]
  count: number
  timestamp: number
}

/**
 * Handle GET /api/status - List stored secrets
 *
 * Returns metadata only (secret names, count) - never values.
 *
 * @param req - Express request
 * @param res - Express response
 * @param storage - Storage provider instance
 */
export async function statusRoute(
  _req: Request,
  res: Response,
  storage: StorageProvider
): Promise<void> {
  try {
    const secretNames = await storage.list()

    const response: StatusResponse = {
      status: 'ok',
      secrets: secretNames.map((name: string) => ({
        name
        // Only metadata - never values
      })),
      count: secretNames.length,
      timestamp: Date.now()
    }

    res.json(response)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve secret list',
      message: errorMessage,
      secrets: [],
      count: 0,
      timestamp: Date.now()
    })
  }
}
