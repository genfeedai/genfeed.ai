import { crmAlignmentValidationAttributes } from '../../attributes/admin/crm-alignment-validation.attributes';
import { simpleConfig } from '../../builders';

export const crmAlignmentValidationSerializerConfig = simpleConfig(
  'crm-alignment-validation',
  crmAlignmentValidationAttributes,
);
