import { creativePatternAttributes } from '@serializers/attributes/analytics/creative-pattern.attributes';
import { simpleConfig } from '@serializers/builders';

export const creativePatternSerializerConfig = simpleConfig(
  'creative-pattern',
  creativePatternAttributes,
);
