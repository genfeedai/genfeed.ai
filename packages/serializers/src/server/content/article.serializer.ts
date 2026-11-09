import { buildSerializer, buildSingleSerializer } from '@serializers/builders';
import {
  articleSerializerConfig,
  publicArticleGenerationSerializerConfig,
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

export const PublicArticleGenerationSerializer = buildSingleSerializer(
  'server',
  publicArticleGenerationSerializerConfig,
);
