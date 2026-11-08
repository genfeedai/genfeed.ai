import { buildSerializer, buildSingleSerializer } from '@serializers/builders';
import {
  articleSerializerConfig,
  publicArticleSerializerConfig,
} from '@serializers/configs';

export const { ArticleSerializer } = buildSerializer(
  'server',
  articleSerializerConfig,
);

export const PublicArticleSerializer = buildSingleSerializer(
  'server',
  publicArticleSerializerConfig,
);
