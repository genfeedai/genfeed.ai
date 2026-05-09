import { topbarBalancesAttributes } from '@serializers/attributes/billing/topbar-balances.attributes';
import { simpleConfig } from '@serializers/builders';

export const topbarBalancesSerializerConfig = simpleConfig(
  'topbar-balances',
  topbarBalancesAttributes,
);
