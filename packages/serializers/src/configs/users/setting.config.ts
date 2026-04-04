import { settingAttributes } from '@serializers/attributes/users/setting.attributes';
import { simpleConfig } from '@serializers/builders';

export const settingSerializerConfig = simpleConfig(
  'setting',
  settingAttributes,
);
