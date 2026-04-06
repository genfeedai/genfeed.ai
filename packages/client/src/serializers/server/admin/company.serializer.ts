import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { companySerializerConfig } from '../../configs';

export const CompanySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  companySerializerConfig,
);
