import type { OnboardingType } from '../users/user.interface';

export type OnboardingStepKey = 'brand' | 'providers';

/**
 * Payload shape for step completion (mirrors UpdateUserOnboardingPayload).
 * Defined here to avoid circular dependency with packages/services.
 */
export interface IOnboardingStepPayload {
  isOnboardingCompleted?: boolean;
  onboardingType?: OnboardingType;
  onboardingStepsCompleted?: string[];
}

/**
 * Value shape for the onboarding wizard React context.
 */
export interface IOnboardingContextValue {
  currentStepIndex: number;
  currentStepKey: OnboardingStepKey;
  saving: boolean;
  stepLabels: string[];
  handleStepComplete: (
    stepKey: OnboardingStepKey,
    extraPayload?: Partial<IOnboardingStepPayload>,
  ) => Promise<void>;
  handleSkip: (stepKey: OnboardingStepKey) => Promise<void>;
  handleBack: () => void;
}
