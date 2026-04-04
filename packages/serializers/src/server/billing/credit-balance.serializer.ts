import { buildSerializer } from '@serializers/builders';
import { creditBalanceSerializerConfig } from '@serializers/configs';

export const { CreditBalanceSerializer } = buildSerializer(
  'server',
  creditBalanceSerializerConfig,
);
