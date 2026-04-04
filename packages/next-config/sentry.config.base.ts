import * as Sentry from '@sentry/nextjs';

interface SentryInitOptions {
  /** Additional tags to include in all events */
  additionalTags?: Record<string, string>;
  /** Override debug mode (default: false) */
  debug?: boolean;
  /** Override enabled state (default: disabled in development) */
  enabled?: boolean;
  /** Override traces sample rate (default: 1) */
  tracesSampleRate?: number;
}

/**
 * Initialize Sentry for Next.js edge/server runtime.
 * Use in both sentry.edge.config.ts and sentry.server.config.ts
 *
 * @example
 * // sentry.edge.config.ts
 * import { initSentry } from '@configs/sentry.config.base';
 * initSentry();
 *
 * // With options
 * initSentry({ tracesSampleRate: 0.5 });
 */
export function initSentry(options: SentryInitOptions = {}): void {
  const {
    additionalTags,
    debug = false,
    enabled = process.env.NODE_ENV !== 'development',
    tracesSampleRate = 1,
  } = options;

  Sentry.init({
    debug,
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    tracesSampleRate,
  });

  if (additionalTags) {
    Sentry.setTags(additionalTags);
  }
}
