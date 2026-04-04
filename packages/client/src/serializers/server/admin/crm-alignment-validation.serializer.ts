import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { crmAlignmentValidationSerializerConfig } from '../../configs';

export const CrmAlignmentValidationSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  crmAlignmentValidationSerializerConfig,
);
