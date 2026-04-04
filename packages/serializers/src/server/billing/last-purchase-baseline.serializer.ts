import { buildSerializer } from '@serializers/builders';
import { lastPurchaseBaselineSerializerConfig } from '@serializers/configs';

export const { LastPurchaseBaselineSerializer } = buildSerializer(
  'server',
  lastPurchaseBaselineSerializerConfig,
);
