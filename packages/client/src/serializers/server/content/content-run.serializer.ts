import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { contentRunSerializerConfig } from '../../configs';

export const ContentRunSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  contentRunSerializerConfig,
);
