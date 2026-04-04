import { revenueRecordAttributes } from '@serializers/attributes/admin/revenue-record.attributes';
import { simpleConfig } from '@serializers/builders';

export const revenueRecordSerializerConfig = simpleConfig(
  'revenue-record',
  revenueRecordAttributes,
);
