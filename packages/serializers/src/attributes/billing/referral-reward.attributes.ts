import { createEntityAttributes } from '@genfeedai/helpers';

export const referralRewardAttributes = createEntityAttributes([
  'status',
  'netAmountCents',
  'purchasedCredits',
  'refundedAmountCents',
  'rewardCredits',
  'reversedCredits',
  'eligibleAt',
  'grantedAt',
  'cancelledAt',
  'reversedAt',
  'referralId',
  'referrerBillingAccountId',
  'referredBillingAccountId',
  'referrerOrganizationId',
  'referredOrganizationId',
  'stripeCheckoutSessionId',
  'stripePaymentIntentId',
  'failureReason',
  'attemptCount',
]);
