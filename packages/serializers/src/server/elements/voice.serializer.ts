import { buildSerializer } from '@serializers/builders';
import { voiceSerializerConfig } from '@serializers/configs';

export const { VoiceSerializer } = buildSerializer(
  'server',
  voiceSerializerConfig,
);
