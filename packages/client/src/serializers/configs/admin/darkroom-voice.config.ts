import { darkroomVoiceAttributes } from '../../attributes/admin/darkroom-voice.attributes';
import { simpleConfig } from '../../builders';

export const darkroomVoiceSerializerConfig = simpleConfig(
  'darkroom-voice',
  darkroomVoiceAttributes,
);
