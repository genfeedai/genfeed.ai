import { darkroomGenerateVoiceResultAttributes } from '@serializers/attributes/admin/darkroom-generate-voice-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomGenerateVoiceResultSerializerConfig = simpleConfig(
  'darkroom-generate-voice-result',
  darkroomGenerateVoiceResultAttributes,
);
