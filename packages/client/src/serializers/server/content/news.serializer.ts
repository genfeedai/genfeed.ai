import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { newsSerializerConfig } from '../../configs';

export const NewsSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  newsSerializerConfig,
);
