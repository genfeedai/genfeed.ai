import { turboProjectAttributes } from '@serializers/attributes/content/turbo-project.attributes';
import { simpleConfig } from '@serializers/builders';

export const turboProjectSerializerConfig = simpleConfig(
  'turbo-project',
  turboProjectAttributes,
);
