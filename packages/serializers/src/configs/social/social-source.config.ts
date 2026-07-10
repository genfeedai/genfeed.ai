import { socialSourceAttributes } from '@serializers/attributes/social/social-source.attributes';
import { simpleConfig } from '@serializers/builders';

export const socialSourceSerializerConfig = simpleConfig(
  'social-source',
  socialSourceAttributes,
);
