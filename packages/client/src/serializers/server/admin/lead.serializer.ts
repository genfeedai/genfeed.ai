import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { leadSerializerConfig } from '../../configs';

export const LeadSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  leadSerializerConfig,
);
