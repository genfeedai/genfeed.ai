import { createEntityAttributes } from '@genfeedai/helpers';

export const orgIntegrationAttributes = createEntityAttributes([
  'config',
  'lastError',
  'lastErrorMessage',
  'organization',
  'platform',
  'status',
]);
