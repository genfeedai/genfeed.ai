import { buildSerializer } from '@serializers/builders';
import { topbarBalancesSerializerConfig } from '@serializers/configs';

export const { TopbarBalancesSerializer } = buildSerializer(
  'server',
  topbarBalancesSerializerConfig,
);
