import { avatarAttributes } from '@serializers/attributes/ingredients/avatar.attributes';
import { simpleConfig } from '@serializers/builders';

export const avatarSerializerConfig = simpleConfig('avatar', avatarAttributes);
