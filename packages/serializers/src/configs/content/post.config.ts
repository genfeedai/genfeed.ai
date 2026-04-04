import { personaAttributes } from '@serializers/attributes/content/persona.attributes';
import { postAttributes } from '@serializers/attributes/content/post.attributes';
import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { credentialAttributes } from '@serializers/attributes/organizations/credential.attributes';
import { nestedRel, rel } from '@serializers/builders';
import {
  BRAND_MINIMAL_REL,
  CONTENT_ENTITY_RELS,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '@serializers/relationships';

export const postSerializerConfig = {
  attributes: postAttributes,
  type: 'post',
  ...CONTENT_ENTITY_RELS,
  children: rel('post', postAttributes),
  credential: rel('credential', credentialAttributes),
  ingredients: nestedRel('ingredient', ingredientAttributes, {
    metadata: rel('metadata', metadataAttributes),
  }),
  parent: rel('post', postAttributes),
  persona: rel('persona', personaAttributes),
};

export const postAnalyticsSerializerConfig = {
  attributes: postAttributes,
  brand: BRAND_MINIMAL_REL,
  ingredients: rel('ingredient', ingredientAttributes),
  organization: ORGANIZATION_MINIMAL_REL,
  post: rel('post', postAttributes),
  type: 'post-analytics',
  user: USER_REL,
};
