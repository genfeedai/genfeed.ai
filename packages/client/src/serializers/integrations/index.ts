import {
  type BuiltSerializer,
  buildSingleSerializer,
  heygenAvatarSerializerConfig,
  heygenServiceSerializerConfig,
  heygenVoiceSerializerConfig,
  serviceSerializerConfig,
  stripeCheckoutSerializerConfig,
  stripeUrlSerializerConfig,
} from '..';

// Build all integration serializers
export const HeyGenServiceSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  heygenServiceSerializerConfig,
);
export const HeyGenVoiceSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  heygenVoiceSerializerConfig,
);
export const HeyGenAvatarSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  heygenAvatarSerializerConfig,
);
export const ServiceSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  serviceSerializerConfig,
);
export const StripeCheckoutSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  stripeCheckoutSerializerConfig,
);
export const StripeUrlSerializer: BuiltSerializer = buildSingleSerializer(
  'client',
  stripeUrlSerializerConfig,
);
