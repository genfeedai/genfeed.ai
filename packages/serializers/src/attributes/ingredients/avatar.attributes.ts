import { createEntityAttributes } from '@genfeedai/helpers';
import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';

export const avatarAttributes = createEntityAttributes([
  ...ingredientAttributes,
  ...metadataAttributes,
  'voice',
  'duration',
  'isDefault',
]);
