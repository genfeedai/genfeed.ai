/**
 * Sentry instrumentation for Telegram service
 */
import { getSentryConfig } from '@libs/config/sentry.config';
import { init } from '@sentry/nestjs';

const config = getSentryConfig({
  serviceName: 'telegram',
});

if (config) {
  init(config);
}
