import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { crmAlignmentValidationSerializerConfig } from '../../configs';

export const CrmAlignmentValidationSerializer: BuiltSerializer =
  buildSingleSerializer('server', crmAlignmentValidationSerializerConfig);
