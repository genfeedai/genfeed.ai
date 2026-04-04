import { settingAttributes } from '../../attributes/users/setting.attributes';
import { userAttributes } from '../../attributes/users/user.attributes';
import { rel } from '../../builders';

export const userSerializerConfig = {
  attributes: userAttributes,
  settings: rel('setting', settingAttributes),
  type: 'user',
};
