import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { purchaseSerializerConfig } from '../../configs';

export const PurchaseSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  purchaseSerializerConfig,
);
