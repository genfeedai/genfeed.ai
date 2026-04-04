import { settingAttributes } from '@serializers/attributes/users/setting.attributes';
import { userAttributes } from '@serializers/attributes/users/user.attributes';
import { rel } from '@serializers/builders';

export const userSerializerConfig = {
  attributes: userAttributes,
  settings: rel('setting', settingAttributes),
  type: 'user',
};
