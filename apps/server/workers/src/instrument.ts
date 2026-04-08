import { getSentryConfig } from '@libs/config/sentry.config';
import { init } from '@sentry/nestjs';

const config = getSentryConfig({
  serviceName: 'workers',
});

if (config) {
  init({
    ...config,
    tracesSampleRate: 0.1,
  });
}
