import { buildSerializer } from '@serializers/builders';
import { metadataSerializerConfig } from '@serializers/configs';

export const { MetadataSerializer } = buildSerializer(
  'server',
  metadataSerializerConfig,
);
