import { buildSerializer } from '@serializers/builders';
import { revenueRecordSerializerConfig } from '@serializers/configs';

export const { RevenueRecordSerializer } = buildSerializer(
  'server',
  revenueRecordSerializerConfig,
);
