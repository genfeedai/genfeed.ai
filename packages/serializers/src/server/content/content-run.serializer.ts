import { buildSerializer } from '@serializers/builders';
import { contentRunSerializerConfig } from '@serializers/configs';

export const { ContentRunSerializer } = buildSerializer(
  'server',
  contentRunSerializerConfig,
);
