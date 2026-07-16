import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * Channel target: a single platform+credential destination within a release
 * group, carrying its own schedule, validation, and execution state (#1124).
 */
export const channelTargetAttributes = createEntityAttributes([
  'releaseId',
  'platform',
  'credentialId',
  'credential',
  'scheduledAt',
  'timezone',
  'settings',
  'validationState',
  'validationIssues',
  'readiness',
  'executionState',
  'externalProviderId',
  'externalShortcode',
  'url',
  'error',
  'retryCount',
  'lastAttemptAt',
  'publishedAt',
  'workflowExecutionId',
  'idempotencyKey',
  'order',
  'attachments',
  'statusTransitions',
]);
