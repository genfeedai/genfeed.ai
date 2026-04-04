import { crmAlignmentValidationAttributes } from '@serializers/attributes/admin/crm-alignment-validation.attributes';
import { simpleConfig } from '@serializers/builders';

export const crmAlignmentValidationSerializerConfig = simpleConfig(
  'crm-alignment-validation',
  crmAlignmentValidationAttributes,
);
