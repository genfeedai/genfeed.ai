import { clipProjectAttributes } from '../../attributes/content/clip-project.attributes';
import { simpleConfig } from '../../builders';

export const clipProjectSerializerConfig = simpleConfig(
  'clip-project',
  clipProjectAttributes,
);
