import { buildSerializer } from '@serializers/builders';
import { settingSerializerConfig } from '@serializers/configs';

export const { SettingSerializer } = buildSerializer(
  'server',
  settingSerializerConfig,
);
