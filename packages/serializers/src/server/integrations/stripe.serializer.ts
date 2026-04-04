import { buildSerializer } from '@serializers/builders';
import {
  stripeCheckoutSerializerConfig,
  stripeUrlSerializerConfig,
} from '@serializers/configs';

export const { StripeCheckoutSerializer } = buildSerializer(
  'server',
  stripeCheckoutSerializerConfig,
);

export const { StripeUrlSerializer } = buildSerializer(
  'server',
  stripeUrlSerializerConfig,
);
