import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { settingSerializerConfig } from '../../configs';

export const SettingSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  settingSerializerConfig,
);
