import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { creatorAnalysisSerializerConfig } from '../../configs';

export const CreatorAnalysisSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  creatorAnalysisSerializerConfig,
);
