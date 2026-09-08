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
  'invitation',
  'diagnostics',
  'readiness',
  'auditEvents',
  'createdAt',
  'updatedAt',
]);
