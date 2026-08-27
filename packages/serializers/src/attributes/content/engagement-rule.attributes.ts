import { createEntityAttributes } from '@genfeedai/helpers';

export const engagementRuleAttributes = createEntityAttributes([
  'organizationId',
  'organization',
  'brandId',
  'brand',
  'userId',
  'user',
  'postGroupId',
  'targetId',
  'metric',
  'threshold',
  'windowEndsAt',
  'actionType',
  'actionPayload',
  'mode',
  'state',
  'isEnabled',
  'triggeredAt',
  'metricSnapshot',
  'resultingReleaseId',
  'lastError',
]);
