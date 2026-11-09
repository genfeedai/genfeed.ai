/**
 * CreditTransaction.referenceType for the deduction that claws back a referral
 * reward after a refund. It moves the balance but is not usage, so usage
 * reports exclude it.
 */
export const REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE =
  'referral-reward-reversal';

/**
 * CreditTransaction.referenceType shared by both rows of a creator payment
 * (the payer's `transfer-out` and the creator's `transfer-in`). The rows also
 * share `referenceId`, the transfer id.
 */
export const CREATOR_PAYMENT_REFERENCE_TYPE = 'creator-payment';

/** referenceType of the two rows that reverse a creator payment. */
export const CREATOR_PAYMENT_REVERSAL_REFERENCE_TYPE =
  'creator-payment-reversal';

/**
 * Platform fee on a creator payment, in basis points of the gross amount.
 * No fee at launch (epic #9714): the creator receives the full amount.
 */
export const CREATOR_PAYMENT_FEE_BPS = 0;
