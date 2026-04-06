import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { leadActivitySerializerConfig } from '../../configs';

export const LeadActivitySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  leadActivitySerializerConfig,
);
