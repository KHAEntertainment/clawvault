/**
 * Shared web utility helpers.
 *
 * Functions in this module are intentionally kept small and side-effect-free
 * so they can be reused across route handlers without importing the full
 * Express application.
 */

import { type Response } from 'express'

/**
 * Send a consistent JSON error response.
 *
 * All API error responses MUST go through this helper so that the shape of
 * error payloads remains uniform and no sensitive information is leaked.
 *
 * @param res     - Express Response object
 * @param status  - HTTP status code
 * @param message - User-facing error message (must NOT contain secret values)
 */
export function errorResponse(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, message })
}
