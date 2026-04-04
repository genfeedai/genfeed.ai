import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { soundSerializerConfig } from '../../configs';

export const SoundSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  soundSerializerConfig,
);
