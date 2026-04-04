import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { contentRunSerializerConfig } from '../../configs';

export const ContentRunSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contentRunSerializerConfig,
);
