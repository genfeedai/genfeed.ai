import {
  stripeCheckoutAttributes,
  stripeUrlAttributes,
} from '../../attributes/integrations/stripe.attributes';
import { simpleConfig } from '../../builders';

export const stripeCheckoutSerializerConfig = simpleConfig(
  'stripe-checkout',
  stripeCheckoutAttributes,
);

export const stripeUrlSerializerConfig = simpleConfig(
  'stripe-url',
  stripeUrlAttributes,
);
