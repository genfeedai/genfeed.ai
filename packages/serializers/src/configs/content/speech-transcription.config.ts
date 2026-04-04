import { speechTranscriptionAttributes } from '@serializers/attributes/content/speech-transcription.attributes';
import { simpleConfig } from '@serializers/builders';

export const speechTranscriptionSerializerConfig = simpleConfig(
  'speech-transcription',
  speechTranscriptionAttributes,
);
