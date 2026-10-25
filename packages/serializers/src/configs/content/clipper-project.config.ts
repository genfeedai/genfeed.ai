import { clipperProjectAttributes } from '@serializers/attributes/content/clipper-project.attributes';
import { simpleConfig } from '@serializers/builders';

export const clipperProjectSerializerConfig = simpleConfig(
  'clipper-project',
  clipperProjectAttributes,
);
