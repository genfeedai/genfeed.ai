import { createEntityAttributes } from '@genfeedai/helpers';
import { referralRewardAttributes } from '@serializers/attributes/billing/referral-reward.attributes';

export const referralAdminRewardAttributes = createEntityAttributes([
  ...referralRewardAttributes,
  'grossAmountCents',
  'netAmountCents',
  'purchasedCredits',
  'refundedAmountCents',
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
