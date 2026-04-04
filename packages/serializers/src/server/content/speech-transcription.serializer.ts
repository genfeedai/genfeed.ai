import { buildSerializer } from '@serializers/builders';
import { speechTranscriptionSerializerConfig } from '@serializers/configs';

export const { SpeechTranscriptionSerializer } = buildSerializer(
  'server',
  speechTranscriptionSerializerConfig,
);
