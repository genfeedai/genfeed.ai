import { buildSerializer } from '@serializers/builders';
import { billingAccountSerializerConfig } from '@serializers/configs';

export const { BillingAccountSerializer } = buildSerializer(
  'server',
  billingAccountSerializerConfig,
);
