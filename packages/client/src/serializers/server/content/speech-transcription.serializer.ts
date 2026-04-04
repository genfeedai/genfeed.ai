import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { speechTranscriptionSerializerConfig } from '../../configs';

export const SpeechTranscriptionSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  speechTranscriptionSerializerConfig,
);
