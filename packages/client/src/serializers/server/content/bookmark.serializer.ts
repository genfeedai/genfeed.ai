import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { bookmarkSerializerConfig } from '../../configs';

export const BookmarkSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  bookmarkSerializerConfig,
);
