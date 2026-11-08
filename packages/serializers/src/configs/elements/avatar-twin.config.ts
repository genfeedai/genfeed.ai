import { avatarTwinAttributes } from '@serializers/attributes/elements/avatar-twin.attributes';
import { simpleConfig } from '@serializers/builders';

export const avatarTwinSerializerConfig = simpleConfig(
  'avatar-twin',
  avatarTwinAttributes,
);
