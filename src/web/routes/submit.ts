/**
 * Secret submission route handler
 *
 * Accepts POST requests with secret data and stores it directly
 * in the encrypted keyring. Never returns secret values in responses.
 *
 * Security: Secret values are only used for storage and never logged.
 */

import * as express from 'express'
import { type StorageProvider } from '../../storage/index.js'
import { errorResponse } from '../utils/response.js'

type Request = express.Request
type Response = express.Response

/**
 * Request body schema for secret submission
 */
interface SubmitRequestBody {
  secretName: string
  secretValue: string
  description?: string
}

/**
 * Handle POST /api/submit - Store a new secret
 *
 * Validates inputs, stores the secret in the keyring, and returns
 * metadata only (name, length) - never the value.
 *
 * @param req - Express request
 * @param res - Express response
 * @param storage - Storage provider instance
 */
export async function submitSecret(
  req: Request,
  res: Response,
  storage: StorageProvider
): Promise<void> {
  const { secretName, secretValue, description } = req.body as SubmitRequestBody

  // Validate required fields with specific, user-friendly messages
  if (!secretName) {
    errorResponse(res, 400, 'Secret name is required')
    return
  }

  if (typeof secretName !== 'string') {
    errorResponse(res, 400, 'Secret name must be a string')
    return
  }

  // Validate secret name format (alphanumeric, underscores, slashes, lowercase start)
  const namePattern = /^[a-z][a-zA-Z0-9_-]*(\/[a-zA-Z0-9_-]+)*$/
  if (!namePattern.test(secretName)) {
    errorResponse(res, 400, 'Secret name must start with a lowercase letter and contain only a–z, A–Z, 0–9, _, -, or /')
    return
  }

  // Validate secret value
  if (typeof secretValue !== 'string') {
    errorResponse(res, 400, 'Secret value must be a string')
    return
  }

  if (secretValue.length === 0) {
    errorResponse(res, 400, 'Secret value is required')
    return
  }

  try {
    // Store the secret directly in the keyring
    await storage.set(secretName, secretValue)

    // Return success with metadata only - never the value
    res.status(200).json({
      success: true,
      message: `Secret "${secretName}" stored successfully`,
      metadata: {
        name: secretName,
        length: secretValue.length,
        description: description || null
      }
    })
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    console.error(`Failed to store secret "${secretName}"`, { error: errorName })

    // Never include provider/internal details in client-facing responses
    errorResponse(res, 500, 'Server error. Please try again later.')
  }
}
