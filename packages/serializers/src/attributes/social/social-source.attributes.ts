import { createEntityAttributes } from '@genfeedai/helpers';

export const socialSourceAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'userId',
  'credentialId',
  'platform',
  'sourceType',
  'externalId',
  'handle',
  'displayName',
  'avatarUrl',
  'profileUrl',
  'bio',
  'followersCount',
  'isActive',
  'lastSyncedAt',
  'lastSyncStatus',
  'lastSyncError',
  'lastPostExternalId',
  'metadata',
]);
