import { createEntityAttributes } from '@genfeedai/helpers';

export const workflowExecutionAttributes = createEntityAttributes([
  'workflow',
  'user',
  'organization',
  'status',
  'trigger',
  'inputValues',
  'nodeResults',
  'progress',
  'startedAt',
  'completedAt',
  'durationMs',
  'error',
  'metadata',
]);
