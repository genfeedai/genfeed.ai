import { crmTaskAttributes } from '@serializers/attributes/admin/crm-task.attributes';
import { simpleConfig } from '@serializers/builders';

export const crmTaskSerializerConfig = simpleConfig(
  'crm-task',
  crmTaskAttributes,
);
