import { getSentryConfig } from '@libs/config/sentry.config';
import { init } from '@sentry/nestjs';

const BOT_PROBE_PATTERNS = [
  /\.php$/i,
  /\.env/i,
  /wp-includes/i,
  /wp-admin/i,
  /wordpress/i,
  /\.xml$/i,
  /\.asp$/i,
];

const env =
  process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';

const config = getSentryConfig({ serviceName: 'api' });

if (config) {
  init({
    ...config,
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
    integrations: [],
    // Override sample rate: 100% in dev/staging, 20% in production
    tracesSampleRate: env === 'production' ? 0.2 : 1.0,
  });
}
