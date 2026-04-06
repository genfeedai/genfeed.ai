import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { modelSerializerConfig } from '../../configs';

export const ModelSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  modelSerializerConfig,
);
