import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * Channel target: a single platform+credential destination within a release
 * group, carrying its own schedule, validation, and execution state (#1124).
 */
export const channelTargetAttributes = createEntityAttributes([
  'releaseId',
  'platform',
  'category',
  'credentialId',
  'credential',
  'scheduledAt',
  'timezone',
  'settings',
  'visibility',
  'validationState',
  'validationIssues',
  'readiness',
  'executionState',
  'source',
  'analytics',
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
