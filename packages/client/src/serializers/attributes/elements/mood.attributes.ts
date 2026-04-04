import { createEntityAttributes } from '@genfeedai/helpers';
import { simpleElementAttributes } from '../../attributes/elements/common-element.attributes';

export const elementMoodAttributes = createEntityAttributes([
  ...simpleElementAttributes,
  'isFavorite',
]);
