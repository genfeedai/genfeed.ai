import { subscriptionAttributionAttributes } from '../../attributes/billing/subscription-attribution.attributes';
import { ORGANIZATION_MINIMAL_REL, USER_REL } from '../../relationships';

export const subscriptionAttributionSerializerConfig = {
  attributes: subscriptionAttributionAttributes,
  organization: ORGANIZATION_MINIMAL_REL,
  type: 'subscription-attribution',
  user: USER_REL,
};
