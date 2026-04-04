import { revenueRecordAttributes } from '../../attributes/admin/revenue-record.attributes';
import { simpleConfig } from '../../builders';

export const revenueRecordSerializerConfig = simpleConfig(
  'revenue-record',
  revenueRecordAttributes,
);
