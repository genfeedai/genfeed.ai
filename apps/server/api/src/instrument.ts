// Import with `const Sentry = require("@sentry/nestjs");` if you are using CJS
import * as Sentry from '@sentry/nestjs';

const env =
  process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';

// Sample 100% of traces in staging/development, 20% in production
const tracesSampleRate = env === 'production' ? 0.2 : 1.0;

const BOT_PROBE_PATTERNS = [
  /\.php$/i,
  /\.env/i,
  /wp-includes/i,
  /wp-admin/i,
  /wordpress/i,
  /\.xml$/i,
  /\.asp$/i,
];

Sentry.init({
  beforeSend(event) {
    // Drop bot/scanner probe errors (404s on .php, .env, wp-*, etc.)
    const url = String(
      event.request?.url || event.tags?.url || event.transaction || '',
    );
    if (BOT_PROBE_PATTERNS.some((p) => p.test(url))) {
      return null;
    }

    // Drop EADDRINUSE from non-production (local dev port conflicts)
    if (env !== 'production') {
      const message = event.exception?.values?.[0]?.value || '';
      if (message.includes('EADDRINUSE')) {
        return null;
      }
    }

    return event;
  },
  dsn: process.env.SENTRY_DSN_API,
  environment: env,
  integrations: [Sentry.httpIntegration({ tracing: true })],
  release: process.env.npm_package_version || '1.0.0',
  // Do not send PII in production by default
  sendDefaultPii: process.env.NODE_ENV !== 'production',
  tracesSampleRate,
});
