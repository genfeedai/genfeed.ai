import { buildSerializer } from '@serializers/builders';
import { purchaseSerializerConfig } from '@serializers/configs';

export const { PurchaseSerializer } = buildSerializer(
  'server',
  purchaseSerializerConfig,
);
