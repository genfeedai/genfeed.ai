import { createEntityAttributes } from '@genfeedai/helpers';

export const fanvueContentAttributes = createEntityAttributes([
  'externalId',
  'title',
  'caption',
  'type',
  'status',
  'mediaUrls',
  'price',
  'isPinned',
  'publishedAt',
  'organization',
  'user',
]);
