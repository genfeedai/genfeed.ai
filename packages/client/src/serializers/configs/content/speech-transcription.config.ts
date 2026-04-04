import { speechTranscriptionAttributes } from '../../attributes/content/speech-transcription.attributes';
import { simpleConfig } from '../../builders';

export const speechTranscriptionSerializerConfig = simpleConfig(
  'speech-transcription',
  speechTranscriptionAttributes,
);
