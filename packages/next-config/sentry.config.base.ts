import * as Sentry from '@sentry/nextjs';

interface SentryInitOptions {
  /** Additional tags to include in all events */
  additionalTags?: Record<string, string>;
  /** Override debug mode (default: false) */
  debug?: boolean;
  /** Override enabled state (default: disabled in development) */
  enabled?: boolean;
  /** Share of requests traced for performance spans (default: 0, off) */
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
 */
export function initSentry(options: SentryInitOptions = {}): void {
  const {
    additionalTags,
    debug = false,
    enabled = process.env.NODE_ENV !== 'development',
    tracesSampleRate = 0,
  } = options;

  Sentry.init({
    debug,
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    // Off unless the app opts in; the website stays error-reporting only.
    tracesSampleRate,
  });

  if (additionalTags) {
    Sentry.setTags(additionalTags);
  }
}
