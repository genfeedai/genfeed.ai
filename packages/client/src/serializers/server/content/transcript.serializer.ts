import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { transcriptSerializerConfig } from '../../configs';

export const TranscriptSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  transcriptSerializerConfig,
);
