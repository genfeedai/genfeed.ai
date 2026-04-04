import { creatorAnalysisAttributes } from '../../attributes/content-intelligence/creator-analysis.attributes';
import { simpleConfig } from '../../builders';

export const creatorAnalysisSerializerConfig = simpleConfig(
  'creator-analysis',
  creatorAnalysisAttributes,
);
