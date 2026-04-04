import { clipProjectAttributes } from '@serializers/attributes/content/clip-project.attributes';
import { simpleConfig } from '@serializers/builders';

export const clipProjectSerializerConfig = simpleConfig(
  'clip-project',
  clipProjectAttributes,
);
