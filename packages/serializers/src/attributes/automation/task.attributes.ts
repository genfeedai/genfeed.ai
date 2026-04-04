import { createEntityAttributes } from '@genfeedai/helpers';

export const taskAttributes = createEntityAttributes([
  'organization',
  'brand',
  'user',
  'workflowId',
  'recurringWorkflow',
  'label',
  'description',
  'key',
  'category',
  'status',
]);
