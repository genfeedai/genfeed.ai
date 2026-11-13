import { createEntityAttributes } from '@genfeedai/helpers';

export const onboardingDraftsReviewAttributes = createEntityAttributes([
  'generatedAt',
  'runs',
  'since',
  'windowDays',
]);
