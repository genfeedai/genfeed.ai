import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { clipProjectSerializerConfig } from '../../configs';

export const ClipProjectSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  clipProjectSerializerConfig,
);
