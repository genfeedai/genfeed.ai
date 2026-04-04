import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { fanvueEarningsSerializerConfig } from '../../configs';

export const FanvueEarningsSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  fanvueEarningsSerializerConfig,
);
