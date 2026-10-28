import { buildSerializer } from '@serializers/builders';
import { onboardingFunnelSerializerConfig } from '@serializers/configs';

export const { OnboardingFunnelSerializer } = buildSerializer(
  'server',
  onboardingFunnelSerializerConfig,
);
