import { costRecordAttributes } from '@serializers/attributes/admin/cost-record.attributes';
import { simpleConfig } from '@serializers/builders';

export const costRecordSerializerConfig = simpleConfig(
  'cost-record',
  costRecordAttributes,
);
