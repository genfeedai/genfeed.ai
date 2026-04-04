import { crmPreparationStatusAttributes } from '../../attributes/admin/crm-preparation-status.attributes';
import { simpleConfig } from '../../builders';

export const crmPreparationStatusSerializerConfig = simpleConfig(
  'crm-preparation-status',
  crmPreparationStatusAttributes,
);
