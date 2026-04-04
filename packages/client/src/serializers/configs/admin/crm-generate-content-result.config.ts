import { crmGenerateContentResultAttributes } from '../../attributes/admin/crm-generate-content-result.attributes';
import { simpleConfig } from '../../builders';

export const crmGenerateContentResultSerializerConfig = simpleConfig(
  'crm-generate-content-result',
  crmGenerateContentResultAttributes,
);
