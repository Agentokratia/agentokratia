import { randomBytes } from 'crypto';

/**
 * Generate a random secret key for agent authentication
 * Returns sk_ prefix + 32-byte base64url string (like Stripe API keys)
 */
export function generateAgentSecret(): string {
  return `sk_${randomBytes(24).toString('base64url')}`;
}
