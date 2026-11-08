import {
  articleAttributes,
  publicArticleAttributes,
} from '@serializers/attributes/content/article.attributes';
import { rel } from '@serializers/builders';
import {
  ASSET_REL,
  BRAND_MINIMAL_REL,
  CONTENT_ENTITY_RELS,
} from '@serializers/relationships';

export const articleSerializerConfig = {
  attributes: articleAttributes,
  type: 'article',
  ...CONTENT_ENTITY_RELS,
  banner: ASSET_REL,
};

/** The byline needs a name, the profile link a handle; nothing else leaves. */
export const publicArticleSerializerConfig = {
  attributes: publicArticleAttributes,
  type: 'article',
  brand: BRAND_MINIMAL_REL,
  tags: rel('tag', ['label']),
  user: rel('user', ['firstName', 'lastName']),
};
