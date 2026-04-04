import { transcriptAttributes } from '@serializers/attributes/content/transcript.attributes';
import { simpleConfig } from '@serializers/builders';

export const transcriptSerializerConfig = simpleConfig(
  'transcript',
  transcriptAttributes,
);
