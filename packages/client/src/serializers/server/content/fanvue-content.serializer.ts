import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { fanvueContentSerializerConfig } from '../../configs';

export const FanvueContentSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  fanvueContentSerializerConfig,
);
