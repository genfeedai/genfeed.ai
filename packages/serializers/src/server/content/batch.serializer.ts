import { buildSerializer } from '@serializers/builders';
import { batchSerializerConfig } from '@serializers/configs';

export const { BatchSerializer } = buildSerializer(
  'server',
  batchSerializerConfig,
);
