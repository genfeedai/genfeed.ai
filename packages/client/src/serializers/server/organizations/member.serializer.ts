import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { memberSerializerConfig } from '../../configs';

export const MemberSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  memberSerializerConfig,
);
