import { onboardingFunnelAttributes } from '@serializers/attributes/organizations/onboarding-funnel.attributes';
import { simpleConfig } from '@serializers/builders';

export const onboardingFunnelSerializerConfig = simpleConfig(
  'onboarding-funnel',
  onboardingFunnelAttributes,
);
