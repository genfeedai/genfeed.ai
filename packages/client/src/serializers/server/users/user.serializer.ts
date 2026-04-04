import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { userSerializerConfig } from '../../configs';

export const UserSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  userSerializerConfig,
);
