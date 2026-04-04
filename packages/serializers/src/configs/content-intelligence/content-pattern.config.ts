import { contentPatternAttributes } from '@serializers/attributes/content-intelligence/content-pattern.attributes';
import { simpleConfig } from '@serializers/builders';

export const contentPatternSerializerConfig = simpleConfig(
  'content-pattern',
  contentPatternAttributes,
);
