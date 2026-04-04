import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { profileSerializerConfig } from '../../configs';

export const ProfileSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  profileSerializerConfig,
);
