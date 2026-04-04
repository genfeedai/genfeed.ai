import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { purchaseSerializerConfig } from '../../configs';

export const PurchaseSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  purchaseSerializerConfig,
);
