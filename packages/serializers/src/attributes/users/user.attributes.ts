import { createEntityAttributes } from '@genfeedai/helpers';

export const userAttributes = createEntityAttributes([
  'settings',
  'handle',
  'firstName',
  'lastName',
  'email',
  'avatar',
  'platformRole',
  'isOnboardingCompleted',
  'onboardingStartedAt',
  'onboardingCompletedAt',
  'onboardingType',
  'onboardingStepsCompleted',
]);
