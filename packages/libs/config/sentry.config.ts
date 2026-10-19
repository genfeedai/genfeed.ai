import type { NodeOptions } from '@sentry/nestjs';

/**
 * Share of production requests traced. Enough for per-route p50/p95 on the API
 * without paying span overhead or Sentry quota on every request.
 */
export const PRODUCTION_TRACES_SAMPLE_RATE = 0.05;

interface SentryConfigOptions {
  serviceName: string;
}

export function getSentryConfig(
  options: SentryConfigOptions,
): NodeOptions | null {
  if (process.env.SENTRY_ENABLED === 'false') {
    return null;
  }

  // Skip Sentry + OTEL instrumentation in dev unless explicitly opted in.
  // 36 OTEL packages would otherwise load on every rebuild.
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.SENTRY_DEV !== 'true'
  ) {
    return null;
  }

  const dsn =
    process.env[
      `SENTRY_DSN_${options.serviceName.toUpperCase().replace(/-/g, '_')}`
    ] || process.env.SENTRY_DSN;

  if (!dsn) {
    return null;
  }

  return {
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    release: process.env.npm_package_version || '1.0.0',
    // Never attach request bodies or IP/user defaults — prompt text must not
    // ride Sentry events in any environment, including staging and local opt-in.
    sendDefaultPii: false,
    // Production samples request traces for route latency; every other
    // environment stays at zero so dev and CI never emit spans.
    tracesSampleRate:
      process.env.NODE_ENV === 'production' ? PRODUCTION_TRACES_SAMPLE_RATE : 0,
  };
}
