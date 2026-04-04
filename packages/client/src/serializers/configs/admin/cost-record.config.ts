import { costRecordAttributes } from '../../attributes/admin/cost-record.attributes';
import { simpleConfig } from '../../builders';

export const costRecordSerializerConfig = simpleConfig(
  'cost-record',
  costRecordAttributes,
);
