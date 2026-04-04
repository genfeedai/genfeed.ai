import {
  type BuiltSerializer,
  buildSingleSerializer,
  settingSerializerConfig,
  userSerializerConfig,
} from '..';

// Build all user serializers
export const SettingSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  settingSerializerConfig,
);
export const UserSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  userSerializerConfig,
);
