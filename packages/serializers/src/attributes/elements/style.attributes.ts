import { createEntityAttributes } from '@genfeedai/helpers';

export const elementStyleAttributes = createEntityAttributes([
  'key',
  'label',
  'description',
  'models',
  'category',
  'isFavorite',
]);
