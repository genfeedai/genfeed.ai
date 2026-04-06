import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { crmGenerateContentResultSerializerConfig } from '../../configs';

export const CrmGenerateContentResultSerializer: BuiltSerializer =
  buildSingleSerializer('server', crmGenerateContentResultSerializerConfig);
