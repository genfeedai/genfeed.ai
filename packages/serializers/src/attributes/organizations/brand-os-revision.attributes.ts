import { createEntityAttributes } from '@genfeedai/helpers';

export const brandOsRevisionAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'version',
  'status',
  'content',
  'approvedById',
  'approvedAt',
]);
