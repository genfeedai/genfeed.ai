import { promptAttributes } from '@serializers/attributes/collections/prompt.attributes';
import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { nestedRel, rel } from '@serializers/builders';
import { ORGANIZATION_MINIMAL_REL } from '@serializers/relationships';

export const promptSerializerConfig = {
  attributes: promptAttributes,
  ingredients: nestedRel('ingredient', ingredientAttributes, {
    metadata: rel('metadata', metadataAttributes),
  }),
  // Present only where a read includes them (the superadmin prompt ledger).
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'prompt',
  user: rel('user', ['email', 'handle']),
};
