import { getSentryConfig } from '@libs/config/sentry.config';
import { init } from '@sentry/nestjs';
import {
  isExpectedPublishRefusal,
  workflowFailureFingerprint,
} from '@workers/monitoring/workflow-failure-fingerprint';

const config = getSentryConfig({
  serviceName: 'workers',
});

if (config) {
  init({
    ...config,
    beforeSend(event, hint) {
      if (isExpectedPublishRefusal(hint.originalException)) return null;
      const fingerprint = workflowFailureFingerprint(hint.originalException);
      if (fingerprint) event.fingerprint = fingerprint;
      return event;
    },
  });
}
