import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { voiceSerializerConfig } from '../../configs';

export const VoiceSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  voiceSerializerConfig,
);
