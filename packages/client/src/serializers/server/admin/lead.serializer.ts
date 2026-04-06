import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { leadSerializerConfig } from '../../configs';

export const LeadSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  leadSerializerConfig,
);
