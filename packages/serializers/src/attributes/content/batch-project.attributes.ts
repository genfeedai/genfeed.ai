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
  'reviewBatchId',
  'itemCounts',
  'items',
]);
