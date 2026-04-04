import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { transcriptSerializerConfig } from '../../configs';

export const TranscriptSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  transcriptSerializerConfig,
);
