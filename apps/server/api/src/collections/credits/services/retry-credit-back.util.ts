import {
  RETRY_CREDIT_BACK_DAILY_CAP_CREDITS,
  RETRY_CREDIT_BACK_RATE,
} from '@genfeedai/contracts/constants';

/** The same brief is the same prompt, ignoring case and spacing. */
export function normalizeBriefPrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface RetryCreditBackInput {
  /** Credits the retry was charged. */
  chargedCredits: number;
  /** Credit-back the user already earned in the current window. */
  earnedInWindowCredits: number;
  hasPriorAttempt: boolean;
  isDraft: boolean;
  /** Free-trial credits are promotional, so a trial organization earns none. */
  isTrialSubject: boolean;
}

/**
 * Whole credits to return for a retry: a share of its price, never past the
 * user's daily cap. Zero means no credit-back.
 */
export function decideRetryCreditBack(input: RetryCreditBackInput): number {
  if (
    input.isDraft ||
    input.isTrialSubject ||
    !input.hasPriorAttempt ||
    !(input.chargedCredits > 0)
  ) {
    return 0;
  }
  const share = Math.floor(input.chargedCredits * RETRY_CREDIT_BACK_RATE);
  const remaining = Math.max(
    0,
    RETRY_CREDIT_BACK_DAILY_CAP_CREDITS - input.earnedInWindowCredits,
  );
  return Math.min(share, remaining);
}
