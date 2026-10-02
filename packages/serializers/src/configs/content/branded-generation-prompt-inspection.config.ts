import { brandedGenerationPromptInspectionAttributes } from '@serializers/attributes/content/branded-generation-prompt-inspection.attributes';
import { simpleConfig } from '@serializers/builders';
export const brandedGenerationPromptInspectionSerializerConfig = simpleConfig(
  'branded-generation-prompt-inspection',
  brandedGenerationPromptInspectionAttributes,
);
