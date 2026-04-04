import { buildSerializer } from '@serializers/builders';
import { articleSerializerConfig } from '@serializers/configs';

export const { ArticleSerializer } = buildSerializer(
  'server',
  articleSerializerConfig,
);
