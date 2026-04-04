import { createEntityAttributes } from '@genfeedai/helpers';

export const fanvueSyncLogAttributes = createEntityAttributes([
  'action',
  'status',
  'errorMessage',
  'itemsProcessed',
  'itemsFailed',
  'metadata',
  'organization',
  'user',
]);
