import { buildSerializer } from '@serializers/builders';
import { costRecordSerializerConfig } from '@serializers/configs';

export const { CostRecordSerializer } = buildSerializer(
  'server',
  costRecordSerializerConfig,
);
