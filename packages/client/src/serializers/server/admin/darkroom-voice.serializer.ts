import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { darkroomVoiceSerializerConfig } from '../../configs';

export const DarkroomVoiceSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  darkroomVoiceSerializerConfig,
);
