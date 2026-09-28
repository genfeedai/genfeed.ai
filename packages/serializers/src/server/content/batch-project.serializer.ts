import { buildSerializer } from '@serializers/builders';
import { batchProjectSerializerConfig } from '@serializers/configs';

export const { BatchProjectSerializer } = buildSerializer(
  'server',
  batchProjectSerializerConfig,
);
