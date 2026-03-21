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
import { errorResponse } from '../utils.js'

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

  // Validate required fields
  if (!secretName || typeof secretName !== 'string') {
    errorResponse(res, 400, 'Invalid request. Please check your input and try again.')
    return
  }

  if (typeof secretValue !== 'string') {
    errorResponse(res, 400, 'Invalid request. Please check your input and try again.')
    return
  }

  // Validate secret name format (alphanumeric, underscores, uppercase start)
  const namePattern = /^[A-Z][A-Z0-9_]*$/
  if (!namePattern.test(secretName)) {
    errorResponse(res, 400, 'Invalid secret name format. Must start with uppercase letter and contain only alphanumeric characters and underscores.')
    return
  }

  // Validate secret value is not empty
  if (secretValue.length === 0) {
    errorResponse(res, 400, 'Invalid request. Please check your input and try again.')
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
    // Log error name and message for server-side debugging.
    // Storage providers throw system-level errors (e.g., keyring command failures)
    // that do not contain secret values, so error.message is safe to log.
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Failed to store secret "${secretName}"`, { error: errorName, message: errorMessage })

    // Never include provider/internal details in client-facing responses
    errorResponse(res, 500, 'Server error. Please try again later.')
  }
}