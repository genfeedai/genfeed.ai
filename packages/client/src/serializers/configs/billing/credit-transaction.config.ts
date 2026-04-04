import { creditTransactionAttributes } from '../../attributes/billing/credit-transaction.attributes';
import { ORGANIZATION_MINIMAL_REL } from '../../relationships';

export const creditTransactionSerializerConfig = {
  attributes: creditTransactionAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'credit-transaction',
};
