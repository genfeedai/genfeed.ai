import { createEntityAttributes } from '@genfeedai/helpers';

export const batchProjectAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'userId',
  'kind',
  'name',
  'status',
  'step',
  'workflowId',
  'settings',
  'revision',
  'quote',
  'reviewBatchId',
  'itemCounts',
  'items',
]);
