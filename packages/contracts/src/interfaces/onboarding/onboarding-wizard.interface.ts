import type { OnboardingType } from '../..';

export type OnboardingStepKey =
  | 'brand'
  | 'positioning'
  | 'corpus'
  | 'providers'
  | 'summary';

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
  /** Organization account type driving the step sequence (`EXPERT` adds steps). */
  accountType: string | null;
  currentStepIndex: number;
  currentStepKey: OnboardingStepKey;
  saving: boolean;
  setAccountType: (accountType: string | null) => void;
  stepLabels: string[];
  /** Ordered wizard steps for the current account type and surface. */
  steps: readonly OnboardingStepKey[];
  handleStepComplete: (
    stepKey: OnboardingStepKey,
    extraPayload?: Partial<IOnboardingStepPayload>,
  ) => Promise<void>;
  handleSkip: (stepKey: OnboardingStepKey) => Promise<void>;
  handleBack: () => void;
}
