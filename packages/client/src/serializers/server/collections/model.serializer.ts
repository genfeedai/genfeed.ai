import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { modelSerializerConfig } from '../../configs';

export const ModelSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  modelSerializerConfig,
);
