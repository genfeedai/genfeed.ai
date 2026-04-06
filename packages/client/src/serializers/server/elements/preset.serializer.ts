import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { presetSerializerConfig } from '../../configs';

export const PresetSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  presetSerializerConfig,
);
