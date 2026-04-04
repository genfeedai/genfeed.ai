import { buildSerializer } from '@serializers/builders';
import { trendSerializerConfig } from '@serializers/configs';

export const { TrendSerializer } = buildSerializer(
  'server',
  trendSerializerConfig,
);
