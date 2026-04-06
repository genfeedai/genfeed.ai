import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { adInsightSerializerConfig } from '../../configs';

export const AdInsightSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  adInsightSerializerConfig,
);
