import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { creatorAnalysisSerializerConfig } from '../../configs';

export const CreatorAnalysisSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  creatorAnalysisSerializerConfig,
);
