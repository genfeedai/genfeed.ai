import { createEntityAttributes } from '@genfeedai/helpers';

export const memberAttributes = createEntityAttributes([
  'organization',
  'user',
  'role',
  'brands',
  'isActive',
]);
