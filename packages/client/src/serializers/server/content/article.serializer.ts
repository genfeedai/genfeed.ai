import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { articleSerializerConfig } from '../../configs';

export const ArticleSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  articleSerializerConfig,
);
