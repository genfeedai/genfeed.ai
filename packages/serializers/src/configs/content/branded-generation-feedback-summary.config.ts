import { brandedGenerationFeedbackSummaryAttributes } from '@serializers/attributes/content/branded-generation-feedback-summary.attributes';
import { simpleConfig } from '@serializers/builders';
export const brandedGenerationFeedbackSummarySerializerConfig = simpleConfig(
  'branded-generation-feedback-summary',
  brandedGenerationFeedbackSummaryAttributes,
);
