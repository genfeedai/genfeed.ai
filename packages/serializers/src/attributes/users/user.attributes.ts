import { createEntityAttributes } from '@genfeedai/helpers';

export const userAttributes = createEntityAttributes([
  'authProviderId',
  'settings',
  'handle',
  'firstName',
  'lastName',
  'email',
  'avatar',
  'isOnboardingCompleted',
  'onboardingStartedAt',
  'onboardingCompletedAt',
  'onboardingType',
  'onboardingStepsCompleted',
]);
