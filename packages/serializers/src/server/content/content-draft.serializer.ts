import { buildSerializer } from '@serializers/builders';
import { contentDraftSerializerConfig } from '@serializers/configs';

export const { ContentDraftSerializer } = buildSerializer(
  'server',
  contentDraftSerializerConfig,
);
