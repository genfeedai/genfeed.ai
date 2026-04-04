import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { contentPlanSerializerConfig } from '../../configs';

export const ContentPlanSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contentPlanSerializerConfig,
);
