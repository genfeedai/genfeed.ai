import { contentPatternAttributes } from '../../attributes/content-intelligence/content-pattern.attributes';
import { simpleConfig } from '../../builders';

export const contentPatternSerializerConfig = simpleConfig(
  'content-pattern',
  contentPatternAttributes,
);
