import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { userSerializerConfig } from '../../configs';

export const UserSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  userSerializerConfig,
);
