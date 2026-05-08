import { buildSerializer } from '@serializers/builders';
import { topbarBalancesSerializerConfig } from '@serializers/configs';

const topbarBalancesSerializers = buildSerializer(
  'server',
  topbarBalancesSerializerConfig,
);

export const { TopbarBalancesSerializer } = topbarBalancesSerializers;
