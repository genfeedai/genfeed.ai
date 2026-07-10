import { buildSerializer } from '@serializers/builders';
import { socialSourceSerializerConfig } from '@serializers/configs';

export const { SocialSourceSerializer } = buildSerializer(
  'server',
  socialSourceSerializerConfig,
);
