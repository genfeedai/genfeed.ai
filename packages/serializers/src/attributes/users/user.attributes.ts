import { createEntityAttributes } from '@genfeedai/helpers';

export const userAttributes = createEntityAttributes([
  'settings',
  'signupAttribution',
  'handle',
  'name',
  'firstName',
  'lastName',
  'email',
  'lastActiveAt',
  'avatar',
  'platformRole',
  'isOnboardingCompleted',
  'onboardingStartedAt',
  'onboardingCompletedAt',
  'onboardingType',
  'onboardingStepsCompleted',
]);
