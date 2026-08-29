import { createEntityAttributes } from '@genfeedai/helpers';

export const agentPublishAuditAttributes = createEntityAttributes([
  'organizationId',
  'organization',
  'brandId',
  'brand',
  'userId',
  'user',
  'postGroupId',
  'workflowExecutionId',
  'agentThreadId',
  'agentStrategyId',
  'autonomyMode',
  'channel',
  'policyName',
  'decision',
  'reason',
]);
