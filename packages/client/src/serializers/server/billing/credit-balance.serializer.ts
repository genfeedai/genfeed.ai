import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { creditBalanceSerializerConfig } from '../../configs';

export const CreditBalanceSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  creditBalanceSerializerConfig,
);
