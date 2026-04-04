import { buildSerializer } from '@serializers/builders';
import { fanvueEarningsSerializerConfig } from '@serializers/configs';

export const { FanvueEarningsSerializer } = buildSerializer(
  'server',
  fanvueEarningsSerializerConfig,
);
