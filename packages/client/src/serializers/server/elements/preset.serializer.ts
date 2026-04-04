import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { presetSerializerConfig } from '../../configs';

export const PresetSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  presetSerializerConfig,
);
