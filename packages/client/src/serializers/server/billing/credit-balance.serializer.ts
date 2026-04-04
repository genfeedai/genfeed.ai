import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { creditBalanceSerializerConfig } from '../../configs';

export const CreditBalanceSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  creditBalanceSerializerConfig,
);
