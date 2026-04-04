import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN_MCP,
  environment: process.env.SENTRY_ENVIRONMENT || 'development',
  release: process.env.npm_package_version || '1.0.0',
  sendDefaultPii: process.env.NODE_ENV !== 'production',
});
