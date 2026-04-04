import { buildSerializer } from '@serializers/builders';
import { adInsightSerializerConfig } from '@serializers/configs';

export const { AdInsightSerializer } = buildSerializer(
  'server',
  adInsightSerializerConfig,
);
