import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { trendSerializerConfig } from '../../configs';

export const TrendSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  trendSerializerConfig,
);
