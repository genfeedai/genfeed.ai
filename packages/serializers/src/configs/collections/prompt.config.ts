import { promptAttributes } from '@serializers/attributes/collections/prompt.attributes';
import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { nestedRel, rel } from '@serializers/builders';

export const promptSerializerConfig = {
  attributes: promptAttributes,
  ingredients: nestedRel('ingredient', ingredientAttributes, {
    metadata: rel('metadata', metadataAttributes),
  }),
  type: 'prompt',
};
