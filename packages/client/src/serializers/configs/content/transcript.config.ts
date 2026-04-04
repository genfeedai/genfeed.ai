import { transcriptAttributes } from '../../attributes/content/transcript.attributes';
import { simpleConfig } from '../../builders';

export const transcriptSerializerConfig = simpleConfig(
  'transcript',
  transcriptAttributes,
);
