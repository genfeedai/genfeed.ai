import { settingAttributes } from '../../attributes/users/setting.attributes';
import { simpleConfig } from '../../builders';

export const settingSerializerConfig = simpleConfig(
  'setting',
  settingAttributes,
);
