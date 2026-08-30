import { createEntityAttributes } from '@genfeedai/helpers';

export const referralRewardAttributes = createEntityAttributes([
  'status',
  'rewardCredits',
  'reversedCredits',
  'eligibleAt',
  'grantedAt',
  'cancelledAt',
  'reversedAt',
]);
