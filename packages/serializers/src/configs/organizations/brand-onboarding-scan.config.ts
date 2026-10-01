import { brandOnboardingScanAttributes } from '@serializers/attributes/organizations/brand-onboarding-scan.attributes';
import { simpleConfig } from '@serializers/builders';

export const brandOnboardingScanSerializerConfig = simpleConfig(
  'brand-onboarding-scan',
  brandOnboardingScanAttributes,
);
