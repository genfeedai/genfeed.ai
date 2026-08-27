import { billingAccountAttributes } from '@serializers/attributes/billing/billing-account.attributes';
import { simpleConfig } from '@serializers/builders';

export const billingAccountSerializerConfig = simpleConfig(
  'billing-account',
  billingAccountAttributes,
);
