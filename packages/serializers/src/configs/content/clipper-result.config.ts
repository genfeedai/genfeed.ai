import { clipperResultAttributes } from '@serializers/attributes/content/clipper-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const clipperResultSerializerConfig = simpleConfig(
  'clipper-result',
  clipperResultAttributes,
);
