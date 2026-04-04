import { creditBalanceAttributes } from '../../attributes/billing/credit-balance.attributes';
import { ORGANIZATION_MINIMAL_REL } from '../../relationships';

export const creditBalanceSerializerConfig = {
  attributes: creditBalanceAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'credit-balance',
};
