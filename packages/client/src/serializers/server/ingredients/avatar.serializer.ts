import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { avatarSerializerConfig } from '../../configs';

const SERVER_AVATAR_ATTRIBUTES = [
  'voice',
  'duration',
  'isDefault',
  'provider',
  'quality',
  'language',
  'gender',
  'age',
];

const SERVER_AVATAR_CONFIG = {
  ...avatarSerializerConfig,
  attributes: [
    ...avatarSerializerConfig.attributes,
    ...SERVER_AVATAR_ATTRIBUTES,
  ],
};

export const AvatarSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  SERVER_AVATAR_CONFIG,
);
