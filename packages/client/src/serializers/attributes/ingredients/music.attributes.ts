import { createEntityAttributes } from '@genfeedai/helpers';
import { ingredientAttributes } from '../../attributes/ingredients/ingredient.attributes';

export const musicAttributes = createEntityAttributes([
  ...ingredientAttributes,
  'duration',
  'label',
]);
