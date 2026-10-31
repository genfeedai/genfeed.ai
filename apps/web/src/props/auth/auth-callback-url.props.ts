import type { ISignupAttribution } from '@genfeedai/contracts/interfaces';

export type AuthCallbackURLOptions = {
  defaultCallbackURL?: string;
  includeOnboardingHandoffParams?: boolean;
  /** Stored first-touch source, carried so a magic link opened elsewhere keeps it. */
  signupAttribution?: ISignupAttribution | null;
};
