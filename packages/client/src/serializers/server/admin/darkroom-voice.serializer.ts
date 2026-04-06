import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { darkroomVoiceSerializerConfig } from '../../configs';

export const DarkroomVoiceSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomVoiceSerializerConfig,
);
