import { createEntityAttributes } from '@genfeedai/helpers';

export const brandOsRevisionAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'version',
  'exportSchemaVersion',
  'status',
  'content',
  'approvedById',
  'approvedAt',
]);
