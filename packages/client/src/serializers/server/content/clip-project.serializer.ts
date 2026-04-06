import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { clipProjectSerializerConfig } from '../../configs';

export const ClipProjectSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  clipProjectSerializerConfig,
);
