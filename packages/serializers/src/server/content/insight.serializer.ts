import { buildSerializer } from '@serializers/builders';
import { insightSerializerConfig } from '@serializers/configs';

export const { InsightSerializer } = buildSerializer(
  'server',
  insightSerializerConfig,
);
