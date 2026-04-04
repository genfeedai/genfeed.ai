import { creditTransactionAttributes } from '@serializers/attributes/billing/credit-transaction.attributes';
import { ORGANIZATION_MINIMAL_REL } from '@serializers/relationships';

export const creditTransactionSerializerConfig = {
  attributes: creditTransactionAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'credit-transaction',
};
