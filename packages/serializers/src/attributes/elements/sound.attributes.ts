import { createEntityAttributes } from '@genfeedai/helpers';

export const soundAttributes = createEntityAttributes([
  'organization',
  'category',
  'label',
  'description',
  'key',
  'isActive',
  'isDefault',
]);
