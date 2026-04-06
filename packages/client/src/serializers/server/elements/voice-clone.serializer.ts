import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { voiceCloneSerializerConfig } from '../../configs';

export const VoiceCloneSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  voiceCloneSerializerConfig,
);
