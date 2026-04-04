import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds
  limit?: number; // Maximum number of requests
  scope?: 'ip' | 'organization' | 'user';
  skipSuccessfulRequests?: boolean; // Skip counting successful requests
  skipFailedRequests?: boolean; // Skip counting failed requests
  keyGenerator?: string; // Custom key generator function name
  user?: string; // Custom user identifier for rate limiting
}

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * Custom rate limit decorator for per-endpoint rate limiting
 * @param options Rate limit configuration
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Common rate limit presets
 */
function getEnvInt(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const RateLimitPresets = {
  // For authentication endpoints
  auth: {
    limit: getEnvInt('RATE_LIMIT_AUTH_LIMIT', 10),
    scope: 'ip' as const,
    skipSuccessfulRequests: false,
    windowMs: getEnvInt('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000),
  },

  // For external API proxies
  external: {
    limit: getEnvInt('RATE_LIMIT_EXTERNAL_LIMIT', 30),
    scope: 'organization' as const,
    windowMs: getEnvInt('RATE_LIMIT_EXTERNAL_WINDOW_MS', 60 * 1000),
  },

  // Relaxed for read-heavy operations
  relaxed: {
    limit: getEnvInt('RATE_LIMIT_RELAXED_LIMIT', 200),
    scope: 'user' as const,
    windowMs: getEnvInt('RATE_LIMIT_RELAXED_WINDOW_MS', 60 * 1000),
  },

  // Standard rate limit for most endpoints
  standard: {
    limit: getEnvInt('RATE_LIMIT_STANDARD_LIMIT', 60),
    scope: 'user' as const,
    windowMs: getEnvInt('RATE_LIMIT_STANDARD_WINDOW_MS', 60 * 1000),
  },
  // Very restrictive for sensitive operations
  strict: {
    limit: getEnvInt('RATE_LIMIT_STRICT_LIMIT', 5),
    scope: 'ip' as const,
    windowMs: getEnvInt('RATE_LIMIT_STRICT_WINDOW_MS', 60 * 1_000),
  },

  // For file uploads and heavy operations
  uploads: {
    limit: getEnvInt('RATE_LIMIT_UPLOADS_LIMIT', 10),
    scope: 'user' as const,
    windowMs: getEnvInt('RATE_LIMIT_UPLOADS_WINDOW_MS', 5 * 60 * 1000),
  },

  // For webhook endpoints
  webhook: {
    limit: getEnvInt('RATE_LIMIT_WEBHOOK_LIMIT', 100),
    scope: 'ip' as const,
    windowMs: getEnvInt('RATE_LIMIT_WEBHOOK_WINDOW_MS', 60 * 1000),
  },
};
