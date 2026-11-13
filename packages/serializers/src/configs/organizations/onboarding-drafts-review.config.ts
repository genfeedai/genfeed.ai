import { onboardingDraftsReviewAttributes } from '@serializers/attributes/organizations/onboarding-drafts-review.attributes';
import { simpleConfig } from '@serializers/builders';

export const onboardingDraftsReviewSerializerConfig = simpleConfig(
  'onboarding-drafts-review',
  onboardingDraftsReviewAttributes,
);
