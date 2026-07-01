import { buildSerializer } from '@serializers/builders';
import { socialMessageSerializerConfig } from '@serializers/configs';

export const { SocialMessageSerializer } = buildSerializer(
  'server',
  socialMessageSerializerConfig,
);
