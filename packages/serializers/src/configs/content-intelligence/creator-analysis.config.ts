import { creatorAnalysisAttributes } from '@serializers/attributes/content-intelligence/creator-analysis.attributes';
import { simpleConfig } from '@serializers/builders';

export const creatorAnalysisSerializerConfig = simpleConfig(
  'creator-analysis',
  creatorAnalysisAttributes,
);
