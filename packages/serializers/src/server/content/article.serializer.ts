import { buildSerializer, buildSingleSerializer } from '@serializers/builders';
import {
  articleSerializerConfig,
  publicArticleGenerationSerializerConfig,
  publicArticleSerializerConfig,
  publicArticleSummarySerializerConfig,
} from '@serializers/configs';

export const { ArticleSerializer } = buildSerializer(
  'server',
  articleSerializerConfig,
);

export const PublicArticleSerializer = buildSingleSerializer(
  'server',
  publicArticleSerializerConfig,
);

export const PublicArticleSummarySerializer = buildSingleSerializer(
  'server',
  publicArticleSummarySerializerConfig,
);

export const PublicArticleGenerationSerializer = buildSingleSerializer(
  'server',
  publicArticleGenerationSerializerConfig,
);
