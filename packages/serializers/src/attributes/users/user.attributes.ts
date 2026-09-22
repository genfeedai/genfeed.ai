import { createEntityAttributes } from '@genfeedai/helpers';

export const userAttributes = createEntityAttributes([
  'settings',
  'signupAttribution',
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
