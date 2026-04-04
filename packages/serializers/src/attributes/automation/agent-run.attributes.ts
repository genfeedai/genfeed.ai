import { createEntityAttributes } from '@genfeedai/helpers';

export const agentRunAttributes = createEntityAttributes([
  'completedAt',
  'creditBudget',
  'creditsUsed',
  'durationMs',
  'error',
  'label',
  'metadata',
  'objective',
  'organization',
  'parentRun',
  'progress',
  'retryCount',
  'startedAt',
  'status',
  'strategy',
  'summary',
  'thread',
  'toolCalls',
  'trigger',
  'user',
]);
