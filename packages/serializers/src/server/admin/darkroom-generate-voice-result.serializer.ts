import { buildSerializer } from '@serializers/builders';
import { darkroomGenerateVoiceResultSerializerConfig } from '@serializers/configs';

export const { DarkroomGenerateVoiceResultSerializer } = buildSerializer(
  'server',
  darkroomGenerateVoiceResultSerializerConfig,
);
