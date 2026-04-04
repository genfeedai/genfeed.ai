import { createEntityAttributes } from '@genfeedai/helpers';
import { ingredientAttributes } from '../../attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '../../attributes/ingredients/metadata.attributes';

export const avatarAttributes = createEntityAttributes([
  ...ingredientAttributes,
  ...metadataAttributes,
  'voice',
  'duration',
  'isDefault',
]);
