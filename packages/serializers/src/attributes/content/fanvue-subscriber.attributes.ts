import { createEntityAttributes } from '@genfeedai/helpers';

export const fanvueSubscriberAttributes = createEntityAttributes([
  'externalId',
  'username',
  'displayName',
  'status',
  'subscribedAt',
  'expiresAt',
  'tier',
  'organization',
  'user',
]);
