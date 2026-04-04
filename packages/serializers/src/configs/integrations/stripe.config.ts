import {
  stripeCheckoutAttributes,
  stripeUrlAttributes,
} from '@serializers/attributes/integrations/stripe.attributes';
import { simpleConfig } from '@serializers/builders';

export const stripeCheckoutSerializerConfig = simpleConfig(
  'stripe-checkout',
  stripeCheckoutAttributes,
);

export const stripeUrlSerializerConfig = simpleConfig(
  'stripe-url',
  stripeUrlAttributes,
);
