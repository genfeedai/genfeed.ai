import { createEntityAttributes } from '@genfeedai/helpers';
export const breakoutResponseAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'credentialId',
  'platform',
  'state',
  'detectedAt',
  'source',
  'trigger',
  'outputs',
  'outputRegistryStatus',
  'capacity',
  'readAt',
]);
