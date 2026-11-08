import { buildSerializer } from '@serializers/builders';
import { avatarTwinSerializerConfig } from '@serializers/configs';

export const { AvatarTwinSerializer } = buildSerializer(
  'server',
  avatarTwinSerializerConfig,
);
