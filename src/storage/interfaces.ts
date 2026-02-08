/**
 * Storage provider interface for platform-specific keyring implementations
 *
 * CRITICAL SECURITY: The get() method returns secret values.
 * This method is for INTERNAL USE ONLY - never expose in public API surface.
 * Secrets retrieved via get() should only be used for direct gateway injection.
 */
export interface StorageProvider {
  /**
   * Store a secret value in the keyring
   * @param name - Secret name (e.g., OPENAI_API_KEY)
   * @param value - Secret value (never logged)
   */
  set(name: string, value: string): Promise<void>

  /**
   * Retrieve a secret value from the keyring
   * INTERNAL USE ONLY - never expose to AI context
   * @param name - Secret name
   * @returns Secret value or null if not found
   */
  get(name: string): Promise<string | null>

  /**
   * Delete a secret from the keyring
   * @param name - Secret name
   */
  delete(name: string): Promise<void>

  /**
   * List all secret names in the keyring
   * @returns Array of secret names (values never included)
   */
  list(): Promise<string[]>

  /**
   * Check if a secret exists in the keyring
   * @param name - Secret name
   * @returns true if secret exists
   */
  has(name: string): Promise<boolean>
}

/**
 * Platform detection result
 */
export interface PlatformInfo {
  platform: NodeJS.Platform
  hasKeyring: boolean
  provider: 'linux' | 'macos' | 'windows' | 'fallback'
}
