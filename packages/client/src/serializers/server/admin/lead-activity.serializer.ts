import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { leadActivitySerializerConfig } from '../../configs';

export const LeadActivitySerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  leadActivitySerializerConfig,
);
