import { crmTaskAttributes } from '../../attributes/admin/crm-task.attributes';
import { simpleConfig } from '../../builders';

export const crmTaskSerializerConfig = simpleConfig(
  'crm-task',
  crmTaskAttributes,
);
