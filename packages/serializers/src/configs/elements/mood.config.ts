import { elementMoodAttributes } from '@serializers/attributes/elements/mood.attributes';
import { simpleConfig } from '@serializers/builders';

export const elementMoodSerializerConfig = simpleConfig(
  'element-mood',
  elementMoodAttributes,
);
