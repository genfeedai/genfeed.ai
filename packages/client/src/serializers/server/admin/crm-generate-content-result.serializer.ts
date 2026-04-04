import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { crmGenerateContentResultSerializerConfig } from '../../configs';

export const CrmGenerateContentResultSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  crmGenerateContentResultSerializerConfig,
);
