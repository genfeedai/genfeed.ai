import { createEntityAttributes } from '@genfeedai/helpers';

export const workflowExecutionAttributes = createEntityAttributes([
  'workflowId',
  'workflow',
  'userId',
  'organizationId',
  'status',
  'trigger',
  'inputValues',
  'nodeResults',
  'progress',
  'failedNodeId',
  'creditsUsed',
  'startedAt',
  'completedAt',
  'durationMs',
  'error',
  'metadata',
  'result',
]);
