import { buildSerializer } from '@serializers/builders';
import { newsSerializerConfig } from '@serializers/configs';

export const { NewsSerializer } = buildSerializer(
  'server',
  newsSerializerConfig,
);
