import { getSentryConfig } from '@libs/config/sentry.config';
import { init } from '@sentry/nestjs';

const config = getSentryConfig({
  serviceName: 'clips',
});

if (config) {
  init(config);
}
