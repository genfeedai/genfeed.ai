import { getSentryConfig } from '@libs/config/sentry.config';
import { init } from '@sentry/nestjs';
import { workflowFailureFingerprint } from '@workers/monitoring/workflow-failure-fingerprint';

const config = getSentryConfig({
  serviceName: 'workers',
});

if (config) {
  init({
    ...config,
    beforeSend(event, hint) {
      const fingerprint = workflowFailureFingerprint(hint.originalException);
      if (fingerprint) event.fingerprint = fingerprint;
      return event;
    },
  });
}
