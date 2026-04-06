import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { soundSerializerConfig } from '../../configs';

export const SoundSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  soundSerializerConfig,
);
