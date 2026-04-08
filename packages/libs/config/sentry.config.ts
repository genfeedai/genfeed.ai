import type { NodeOptions } from '@sentry/nestjs';

interface SentryConfigOptions {
  serviceName: string;
}

export function getSentryConfig(
  options: SentryConfigOptions,
): NodeOptions | null {
  if (process.env.SENTRY_ENABLED === 'false') {
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
    sendDefaultPii: process.env.NODE_ENV !== 'production',
  };
}
