import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import {
  stripeCheckoutSerializerConfig,
  stripeUrlSerializerConfig,
} from '../../configs';

export const StripeCheckoutSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  stripeCheckoutSerializerConfig,
);

export const StripeUrlSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  stripeUrlSerializerConfig,
);
