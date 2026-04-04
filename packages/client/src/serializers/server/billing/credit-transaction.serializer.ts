import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { creditTransactionSerializerConfig } from '../../configs';

export const CreditTransactionSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  creditTransactionSerializerConfig,
);
