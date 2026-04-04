import { createEntityAttributes } from '@genfeedai/helpers';
import { simpleElementAttributes } from '@serializers/attributes/elements/common-element.attributes';

export const elementMoodAttributes = createEntityAttributes([
  ...simpleElementAttributes,
  'isFavorite',
]);
