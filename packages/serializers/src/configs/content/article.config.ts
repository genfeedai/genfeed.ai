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

/**
 * A generation embedded in a public article (#9663): what it is, the model
 * that made it and, when the author shows it, its prompt. Typed `ingredient`
 * so the response pipeline attaches the public media grant.
 */
export const publicArticleGenerationSerializerConfig = {
  attributes: ['category', 'status', 'metadata', 'prompt'],
  type: 'ingredient',
  metadata: rel('metadata', [
    'label',
    'description',
    'model',
    'modelLabel',
    'width',
    'height',
  ]),
  prompt: rel('prompt', ['original']),
};
