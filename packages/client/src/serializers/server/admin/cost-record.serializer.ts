import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { costRecordSerializerConfig } from '../../configs';

export const CostRecordSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  costRecordSerializerConfig,
);
