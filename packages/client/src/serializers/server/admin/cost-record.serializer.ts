import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { costRecordSerializerConfig } from '../../configs';

export const CostRecordSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  costRecordSerializerConfig,
);
