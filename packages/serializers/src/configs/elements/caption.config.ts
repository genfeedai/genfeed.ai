import { captionAttributes } from '@serializers/attributes/elements/caption.attributes';
import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { nestedRel, rel } from '@serializers/builders';
import { USER_REL } from '@serializers/relationships';

export const captionSerializerConfig = {
  attributes: captionAttributes,
  ingredient: nestedRel('ingredient', ingredientAttributes, {
    metadata: rel('metadata', metadataAttributes),
  }),
  type: 'caption',
  user: USER_REL,
};
