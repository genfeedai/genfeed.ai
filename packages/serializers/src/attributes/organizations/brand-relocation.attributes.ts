import { createEntityAttributes } from '@genfeedai/helpers';
export const brandRelocationAttributes = createEntityAttributes([
  'brandId',
  'organizationId',
  'destinationOrganizationId',
  'status',
  'summary',
  'error',
]);
