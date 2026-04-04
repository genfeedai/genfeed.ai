import { captionAttributes } from '../../attributes/elements/caption.attributes';
import { ingredientAttributes } from '../../attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '../../attributes/ingredients/metadata.attributes';
import { nestedRel, rel } from '../../builders';
import { USER_REL } from '../../relationships';

export const captionSerializerConfig = {
  attributes: captionAttributes,
  ingredient: nestedRel('ingredient', ingredientAttributes, {
    metadata: rel('metadata', metadataAttributes),
  }),
  type: 'caption',
  user: USER_REL,
};
