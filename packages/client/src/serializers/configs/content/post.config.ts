import { personaAttributes } from '../../attributes/content/persona.attributes';
import { postAttributes } from '../../attributes/content/post.attributes';
import { ingredientAttributes } from '../../attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '../../attributes/ingredients/metadata.attributes';
import { credentialAttributes } from '../../attributes/organizations/credential.attributes';
import { nestedRel, rel } from '../../builders';
import {
  BRAND_MINIMAL_REL,
  CONTENT_ENTITY_RELS,
  ORGANIZATION_MINIMAL_REL,
  USER_REL,
} from '../../relationships';

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
