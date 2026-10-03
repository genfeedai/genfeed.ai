import { buildSingleSerializer } from '@serializers/builders';
import { publicationInsightSerializerConfig } from '@serializers/configs/content/publication-insight.config';

export const PublicationInsightSerializer = buildSingleSerializer(
  'server',
  publicationInsightSerializerConfig,
);
