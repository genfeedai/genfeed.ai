import { createEntityAttributes } from '@genfeedai/helpers';

export const monitoredAccountAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'userId',
  'botConfigId',
  'credentialId',

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
