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
  'accounting',
  'startedAt',
  'completedAt',
  'durationMs',
  'error',
  'metadata',
  'result',
]);
