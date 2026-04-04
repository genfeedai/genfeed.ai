import { createEntityAttributes } from '@genfeedai/helpers';

export const trackedLinkAttributes = createEntityAttributes([
  'organization',
  'originalUrl',
  'shortUrl',
  'shortCode',
  'customSlug',
  'content',
  'contentType',
  'platform',
  'brand',
  'campaignName',
  'utm',
  'stats',
  'isActive',
  'expiresAt',
]);
