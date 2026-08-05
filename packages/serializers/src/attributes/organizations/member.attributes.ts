import { createEntityAttributes } from '@genfeedai/helpers';

export const memberAttributes = createEntityAttributes([
  'organizationId',
  'userId',
  'roleId',
  'roleKey',
  'lastUsedBrandId',
  'isActive',
]);
