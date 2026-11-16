import { buildSerializer } from '@serializers/builders';
import { onboardingDraftsReviewSerializerConfig } from '@serializers/configs';

export const { OnboardingDraftsReviewSerializer } = buildSerializer(
  'server',
  onboardingDraftsReviewSerializerConfig,
);
