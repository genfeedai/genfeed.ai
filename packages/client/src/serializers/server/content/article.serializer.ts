import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { articleSerializerConfig } from '../../configs';

export const ArticleSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  articleSerializerConfig,
);
