import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { fanvueEarningsSerializerConfig } from '../../configs';

export const FanvueEarningsSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  fanvueEarningsSerializerConfig,
);
