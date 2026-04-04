import { articleAttributes } from '@serializers/attributes/content/article.attributes';
import { ASSET_REL, CONTENT_ENTITY_RELS } from '@serializers/relationships';

export const articleSerializerConfig = {
  attributes: articleAttributes,
  type: 'article',
  ...CONTENT_ENTITY_RELS,
  banner: ASSET_REL,
};
