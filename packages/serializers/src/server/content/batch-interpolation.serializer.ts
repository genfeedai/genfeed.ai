import { buildSerializer } from '@serializers/builders';
import { batchInterpolationSerializerConfig } from '@serializers/configs';

export const { BatchInterpolationSerializer } = buildSerializer(
  'server',
  batchInterpolationSerializerConfig,
);
