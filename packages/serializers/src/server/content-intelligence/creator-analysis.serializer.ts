import { buildSerializer } from '@serializers/builders';
import { creatorAnalysisSerializerConfig } from '@serializers/configs';

export const { CreatorAnalysisSerializer } = buildSerializer(
  'server',
  creatorAnalysisSerializerConfig,
);
