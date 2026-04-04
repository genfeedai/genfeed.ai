import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { insightSerializerConfig } from '../../configs';

export const InsightSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  insightSerializerConfig,
);
