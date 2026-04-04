import { buildSerializer } from '@serializers/builders';
import { roleSerializerConfig } from '@serializers/configs';

export const { RoleSerializer } = buildSerializer(
  'server',
  roleSerializerConfig,
);
