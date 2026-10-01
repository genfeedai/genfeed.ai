import { buildSerializer } from '@serializers/builders';
import { brandOnboardingScanSerializerConfig } from '@serializers/configs/organizations/brand-onboarding-scan.config';

export const { BrandOnboardingScanSerializer } = buildSerializer(
  'server',
  brandOnboardingScanSerializerConfig,
);
