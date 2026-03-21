/**
 * Shared error response utility
 *
 * Provides consistent error response formatting across all web routes.
 * Ensures API responses follow the same structure and never leak sensitive information.
 */

import { type Response } from 'express'

/**
 * Centralized error response helper for consistent API error formatting.
 * Ensures all error responses follow the same structure and never leak sensitive information.
 *
 * @param res - Express response object
 * @param status - HTTP status code
 * @param message - User-friendly error message (must not contain sensitive data)
 */
export function errorResponse(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, message })
}
