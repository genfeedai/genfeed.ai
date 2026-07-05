import { platformSettingAttributes } from '@serializers/attributes/collections/platform-setting.attributes';
import { simpleConfig } from '@serializers/builders';

export const platformSettingSerializerConfig = simpleConfig(
  'platformSetting',
  platformSettingAttributes,
);
