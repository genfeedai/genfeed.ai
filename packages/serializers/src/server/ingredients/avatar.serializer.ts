import { buildSerializer } from '@serializers/builders';
import { avatarSerializerConfig } from '@serializers/configs';

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

export const { AvatarSerializer } = buildSerializer(
  'server',
  SERVER_AVATAR_CONFIG,
);
