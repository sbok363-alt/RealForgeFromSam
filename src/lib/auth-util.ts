/**
 * Authentication and environment safety utilities for Forge platform.
 */

/**
 * Validates whether demo authentication is explicitly permitted.
 * Both conditions are strictly required:
 * 1. Environment MUST NOT be production (NODE_ENV !== 'production').
 * 2. Explicit opt-in flag ALLOW_DEMO_AUTH MUST be set to 'true'.
 */
export function isDemoAuthAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_AUTH === 'true';
}
