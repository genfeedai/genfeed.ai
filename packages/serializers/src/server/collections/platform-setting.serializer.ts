import { buildSerializer } from '@serializers/builders';
import { platformSettingSerializerConfig } from '@serializers/configs';

export const { PlatformSettingSerializer } = buildSerializer(
  'server',
  platformSettingSerializerConfig,
);
