/**
 * Share of the latest paid grant (a plan period or a credit pack) below which
 * a paying organization is "running low".
 */
export const PAID_LOW_CREDIT_ALLOWANCE_SHARE = 0.1;

export type LowCreditThresholdInput = {
  /** Price of one image on the organization's default image model. */
  defaultImageCredits: number | null;
  /** The organization never paid and is inside its free trial. */
  isTrialSubject: boolean;
  /** Credits in the latest paid grant, when the organization paid. */
  latestPaidGrantCredits: number | null;
};

/**
 * The balance below which `CREDITS_LOW` fires. A fixed number was wrong both
 * ways: 1000 credits meant every free organization was permanently "low",
 * while a large plan could drain far past it before the alert. So the
 * threshold follows what the organization can actually do:
 *
 * - Never paid (inside its trial): one default image. Below that the free
 *   credits buy nothing useful; above it they still do.
 * - Paid: 10% of the latest paid grant, so the alert scales with the plan or
 *   pack, and never below one default image.
 *
 * Returns null when nothing is known (no price, no paid grant), which means
 * "do not alert" rather than guessing.
 */
export function resolveLowCreditThreshold(
  input: LowCreditThresholdInput,
): number | null {
  const imageCredits =
    input.defaultImageCredits !== null && input.defaultImageCredits > 0
      ? input.defaultImageCredits
      : null;
  if (input.isTrialSubject) {
    return imageCredits;
  }
  const allowanceCredits =
    input.latestPaidGrantCredits !== null && input.latestPaidGrantCredits > 0
      ? Math.ceil(
          input.latestPaidGrantCredits * PAID_LOW_CREDIT_ALLOWANCE_SHARE,
        )
      : null;
  if (imageCredits === null && allowanceCredits === null) {
    return null;
  }
  return Math.max(imageCredits ?? 0, allowanceCredits ?? 0);
}
