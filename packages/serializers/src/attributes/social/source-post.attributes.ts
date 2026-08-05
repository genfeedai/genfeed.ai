import { createEntityAttributes } from '@genfeedai/helpers';

export const sourcePostAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'userId',
  'sourceId',
  'platform',
  'externalId',
  'contentType',
  'text',
  'authorId',
  'authorHandle',
  'authorDisplayName',
  'authorAvatarUrl',
  'authorFollowersCount',
  'sourceUrl',
  'mediaUrls',
  'thumbnailUrl',
  'metrics',
  'hashtags',
  'publishedAt',
  'collectedAt',
]);
