import { BRAND } from '../../shared/branding'

/**
 * API base URL.
 *
 * Resolution order:
 *   1. process.env.WHYSPR_API_URL  (set this for dev — e.g. http://localhost:3000)
 *   2. BRAND.apiBaseUrl            (production default)
 */
export function apiBase(): string {
  return (process.env.WHYSPR_API_URL || BRAND.apiBaseUrl).replace(/\/$/, '')
}

/** Background heartbeat interval — 1 hour. */
export const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000

/** JWT TTL is 1h on the server. Refresh proactively before that. */
export const TOKEN_REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000

/** Trial countdown banner triggers when daysRemaining <= this. */
export const TRIAL_BANNER_DAYS = 7
