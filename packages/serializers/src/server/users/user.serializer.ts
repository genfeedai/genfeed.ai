import { buildSerializer } from '@serializers/builders';
import { userSerializerConfig } from '@serializers/configs';

export const { UserSerializer } = buildSerializer(
  'server',
  userSerializerConfig,
);
