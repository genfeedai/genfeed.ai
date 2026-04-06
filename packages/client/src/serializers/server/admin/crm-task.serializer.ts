import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { crmTaskSerializerConfig } from '../../configs';

export const CrmTaskSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  crmTaskSerializerConfig,
);
