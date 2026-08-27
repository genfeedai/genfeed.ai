import { buildSerializer } from '@serializers/builders';
import { rssSourceSerializerConfig } from '@serializers/configs';

export const { RssSourceSerializer } = buildSerializer(
  'server',
  rssSourceSerializerConfig,
);
