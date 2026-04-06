import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { contentPatternSerializerConfig } from '../../configs';

export const ContentPatternSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contentPatternSerializerConfig,
);
