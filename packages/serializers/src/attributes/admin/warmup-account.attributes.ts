import { createEntityAttributes } from '@genfeedai/helpers';

export const warmupAccountAttributes = createEntityAttributes([
  'leadEmail',
  'leadFirstName',
  'leadLastName',
  'organizationName',
  'brandName',
  'websiteUrl',
  'guidance',
  'status',
  'operatorUserId',
  'customerUserId',
  'organizationId',
  'brandId',
  'invitationId',
  'diagnostics',
  'auditEvents',
  'createdAt',
  'updatedAt',
]);
