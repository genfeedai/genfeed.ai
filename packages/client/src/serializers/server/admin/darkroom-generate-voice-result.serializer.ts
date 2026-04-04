import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { darkroomGenerateVoiceResultSerializerConfig } from '../../configs';

export const DarkroomGenerateVoiceResultSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomGenerateVoiceResultSerializerConfig,
);
