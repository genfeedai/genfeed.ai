import { createEntityAttributes } from '@genfeedai/helpers';

export const rssSourceAttributes = createEntityAttributes([
  'organizationId',
  'organization',
  'brandId',
  'brand',
  'userId',
  'user',
  'label',
  'feedUrl',
  'importPolicy',
  'approvalMode',
  'timezone',
  'targetChannels',
  'isEnabled',
  'lastPolledAt',
  'lastError',
  'importedCount',
  'skippedCount',
  'failedCount',
]);
