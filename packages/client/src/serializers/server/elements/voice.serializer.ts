import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { voiceSerializerConfig } from '../../configs';

export const VoiceSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  voiceSerializerConfig,
);
