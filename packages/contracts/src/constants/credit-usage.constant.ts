/**
 * CreditTransaction.referenceType for the deduction that claws back a referral
 * reward after a refund. It moves the balance but is not usage, so usage
 * reports exclude it.
 */
export const REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE =
  'referral-reward-reversal';
