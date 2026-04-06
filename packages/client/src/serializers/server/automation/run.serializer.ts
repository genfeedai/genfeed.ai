import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { runSerializerConfig } from '../../configs';

export const RunSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  runSerializerConfig,
);
