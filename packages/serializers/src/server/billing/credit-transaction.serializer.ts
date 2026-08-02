import { buildSerializer } from '@serializers/builders';
import { creditTransactionSerializerConfig } from '@serializers/configs';

export const { CreditTransactionSerializer } = buildSerializer(
  'server',
  creditTransactionSerializerConfig,
);
