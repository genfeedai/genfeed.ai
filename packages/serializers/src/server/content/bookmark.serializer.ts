import { buildSerializer } from '@serializers/builders';
import { bookmarkSerializerConfig } from '@serializers/configs';

export const { BookmarkSerializer } = buildSerializer(
  'server',
  bookmarkSerializerConfig,
);
