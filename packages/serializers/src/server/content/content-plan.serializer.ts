import { buildSerializer } from '@serializers/builders';
import { contentPlanSerializerConfig } from '@serializers/configs';

export const { ContentPlanSerializer } = buildSerializer(
  'server',
  contentPlanSerializerConfig,
);
