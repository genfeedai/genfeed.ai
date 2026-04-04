import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { lastPurchaseBaselineSerializerConfig } from '../../configs';

export const LastPurchaseBaselineSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  lastPurchaseBaselineSerializerConfig,
);
