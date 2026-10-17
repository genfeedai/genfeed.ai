import { brandedGenerationFeedbackAttributes } from '@serializers/attributes/content/branded-generation-feedback.attributes';
import { simpleConfig } from '@serializers/builders';
export const brandedGenerationFeedbackSerializerConfig = simpleConfig(
  'branded-generation-feedback',
  brandedGenerationFeedbackAttributes,
);
