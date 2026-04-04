import { createEntityAttributes } from '@genfeedai/helpers';

export const elementBlacklistAttributes = createEntityAttributes([
  'organization',
  'label',
  'description',
  'key',
  'category',
  'isActive',
  'isDefault',
  'isFavorite',
]);
