import { buildSerializer } from '@serializers/builders';
import { linkSerializerConfig } from '@serializers/configs';

export const { LinkSerializer } = buildSerializer(
  'server',
  linkSerializerConfig,
);
