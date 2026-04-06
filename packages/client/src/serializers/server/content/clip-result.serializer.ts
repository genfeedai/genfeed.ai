import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { clipResultSerializerConfig } from '../../configs';

export const ClipResultSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  clipResultSerializerConfig,
);
