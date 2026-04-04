import { buildSerializer } from '@serializers/builders';
import { crmAlignmentValidationSerializerConfig } from '@serializers/configs';

export const { CrmAlignmentValidationSerializer } = buildSerializer(
  'server',
  crmAlignmentValidationSerializerConfig,
);
