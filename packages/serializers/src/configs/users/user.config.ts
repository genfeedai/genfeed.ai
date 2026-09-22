import { settingAttributes } from '@serializers/attributes/users/setting.attributes';
import { userSignupAttributionAttributes } from '@serializers/attributes/users/signup-attribution.attributes';
import { userAttributes } from '@serializers/attributes/users/user.attributes';
import { rel } from '@serializers/builders';

export const userSerializerConfig = {
  attributes: userAttributes,
  settings: rel('setting', settingAttributes),
  signupAttribution: rel(
    'user-signup-attribution',
    userSignupAttributionAttributes,
  ),
  type: 'user',
};
