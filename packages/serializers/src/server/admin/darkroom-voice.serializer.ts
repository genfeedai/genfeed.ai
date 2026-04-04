import { buildSerializer } from '@serializers/builders';
import { darkroomVoiceSerializerConfig } from '@serializers/configs';

export const { DarkroomVoiceSerializer } = buildSerializer(
  'server',
  darkroomVoiceSerializerConfig,
);
