import { createEntityAttributes } from '@genfeedai/helpers';

export const threadAttributes = createEntityAttributes([
  'organization',
  'user',
  'title',
  'source',
  'status',
]);
