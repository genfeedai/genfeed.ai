import { crmPreparationStatusAttributes } from '@serializers/attributes/admin/crm-preparation-status.attributes';
import { simpleConfig } from '@serializers/builders';

export const crmPreparationStatusSerializerConfig = simpleConfig(
  'crm-preparation-status',
  crmPreparationStatusAttributes,
);
