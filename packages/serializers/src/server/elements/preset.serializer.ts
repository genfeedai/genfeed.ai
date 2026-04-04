import { buildSerializer } from '@serializers/builders';
import { presetSerializerConfig } from '@serializers/configs';

export const { PresetSerializer } = buildSerializer(
  'server',
  presetSerializerConfig,
);
