import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { fanvueContentSerializerConfig } from '../../configs';

export const FanvueContentSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  fanvueContentSerializerConfig,
);
