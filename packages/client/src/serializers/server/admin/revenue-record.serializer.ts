import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { revenueRecordSerializerConfig } from '../../configs';

export const RevenueRecordSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  revenueRecordSerializerConfig,
);
