import { crmGenerateContentResultAttributes } from '@serializers/attributes/admin/crm-generate-content-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const crmGenerateContentResultSerializerConfig = simpleConfig(
  'crm-generate-content-result',
  crmGenerateContentResultAttributes,
);
