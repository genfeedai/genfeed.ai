import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { speechTranscriptionSerializerConfig } from '../../configs';

export const SpeechTranscriptionSerializer: BuiltSerializer =
  buildSingleSerializer('server', speechTranscriptionSerializerConfig);
