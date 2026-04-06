import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { bookmarkSerializerConfig } from '../../configs';

export const BookmarkSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  bookmarkSerializerConfig,
);
