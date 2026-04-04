import { darkroomVoiceAttributes } from '@serializers/attributes/admin/darkroom-voice.attributes';
import { simpleConfig } from '@serializers/builders';

export const darkroomVoiceSerializerConfig = simpleConfig(
  'darkroom-voice',
  darkroomVoiceAttributes,
);
