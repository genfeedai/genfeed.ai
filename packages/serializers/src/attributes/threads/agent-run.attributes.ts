import { createEntityAttributes } from '@genfeedai/helpers';

export const agentRunAttributes = createEntityAttributes([
  'brandId',
  'brandLabel',
  'decisionHref',
  'inputRequestId',
  'isProjectionStale',
  'projectedAt',
  'runtimeState',
  'startedAt',
  'threadId',
  'threadTitle',
]);
