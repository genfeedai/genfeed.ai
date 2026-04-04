// Import with `const Sentry = require("@sentry/nestjs");` if you are using CJS
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN_FILES,
  environment: process.env.SENTRY_ENVIRONMENT || 'development',
  release: process.env.npm_package_version || '1.0.0',
  // Do not send PII in production by default
  sendDefaultPii: process.env.NODE_ENV !== 'production',
});
