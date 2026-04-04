import { buildSerializer } from '@serializers/builders';
import { voiceCloneSerializerConfig } from '@serializers/configs';

export const { VoiceCloneSerializer } = buildSerializer(
  'server',
  voiceCloneSerializerConfig,
);
