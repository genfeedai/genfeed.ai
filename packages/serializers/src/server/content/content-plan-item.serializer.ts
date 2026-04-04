import { buildSerializer } from '@serializers/builders';
import { contentPlanItemSerializerConfig } from '@serializers/configs';

export const { ContentPlanItemSerializer } = buildSerializer(
  'server',
  contentPlanItemSerializerConfig,
);
