import { buildSerializer } from '@serializers/builders';
import { transcriptSerializerConfig } from '@serializers/configs';

export const { TranscriptSerializer } = buildSerializer(
  'server',
  transcriptSerializerConfig,
);
