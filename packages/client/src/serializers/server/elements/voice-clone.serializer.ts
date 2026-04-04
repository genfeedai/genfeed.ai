import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { voiceCloneSerializerConfig } from '../../configs';

export const VoiceCloneSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  voiceCloneSerializerConfig,
);
