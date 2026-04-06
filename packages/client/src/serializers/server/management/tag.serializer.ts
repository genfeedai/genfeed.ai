import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { tagSerializerConfig } from '../../configs';

export const TagSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  tagSerializerConfig,
);
