import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { roleSerializerConfig } from '../../configs';

export const RoleSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  roleSerializerConfig,
);
