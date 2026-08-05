import { createEntityAttributes } from '@genfeedai/helpers';

export const watchlistAttributes = createEntityAttributes([
  'brandId',
  'organizationId',
  'userId',
  'label',
  'platform',
  'handle',
  'category',
  'notes',
  'metrics',
  'profileUrl',
  'avatarUrl',
]);
