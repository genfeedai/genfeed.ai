import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { profileSerializerConfig } from '../../configs';

export const ProfileSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  profileSerializerConfig,
);
