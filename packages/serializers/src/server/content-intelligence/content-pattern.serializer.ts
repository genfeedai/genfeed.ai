import { buildSerializer } from '@serializers/builders';
import { contentPatternSerializerConfig } from '@serializers/configs';

export const { ContentPatternSerializer } = buildSerializer(
  'server',
  contentPatternSerializerConfig,
);
