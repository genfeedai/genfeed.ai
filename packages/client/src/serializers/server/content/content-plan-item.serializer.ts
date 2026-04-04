import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { contentPlanItemSerializerConfig } from '../../configs';

export const ContentPlanItemSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contentPlanItemSerializerConfig,
);
