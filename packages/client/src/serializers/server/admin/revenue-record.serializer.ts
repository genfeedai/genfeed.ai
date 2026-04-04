import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { revenueRecordSerializerConfig } from '../../configs';

export const RevenueRecordSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  revenueRecordSerializerConfig,
);
