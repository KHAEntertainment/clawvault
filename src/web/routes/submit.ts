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
    res.status(400).json({
      success: false,
      error: 'Missing or invalid secretName'
    })
    return
  }

  if (!secretValue || typeof secretValue !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Missing or invalid secretValue'
    })
    return
  }

  // Validate secret name format (alphanumeric, underscores, uppercase start)
  const namePattern = /^[A-Z][A-Z0-9_]*$/
  if (!namePattern.test(secretName)) {
    res.status(400).json({
      success: false,
      error: 'Invalid secret name format. Must start with uppercase letter and contain only alphanumeric characters and underscores.'
    })
    return
  }

  // Validate secret value is not empty
  if (secretValue.length === 0) {
    res.status(400).json({
      success: false,
      error: 'Secret value cannot be empty'
    })
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Never include secret values in error messages
    res.status(500).json({
      success: false,
      error: 'Failed to store secret',
      message: errorMessage
    })
  }
}
