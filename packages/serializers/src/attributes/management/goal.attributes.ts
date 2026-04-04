import { createEntityAttributes } from '@genfeedai/helpers';

export const goalAttributes = createEntityAttributes([
  'organization',
  'title',
  'description',
  'status',
  'level',
  'parentId',
]);
