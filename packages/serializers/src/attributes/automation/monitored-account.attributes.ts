import { createEntityAttributes } from '@genfeedai/helpers';

export const monitoredAccountAttributes = createEntityAttributes([
  'organization',
  'brand',
  'user',
  'botConfig',

  'platform',
  'externalId',
  'username',
  'displayName',
  'avatarUrl',
  'followersCount',
  'bio',

  'isActive',
  'lastCheckedAt',
  'lastPostId',
]);
