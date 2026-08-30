import { createEntityAttributes } from '@genfeedai/helpers';

export const referralProgramAttributes = createEntityAttributes([
  'code',
  'shareUrl',
  'referralCount',
  'convertedCount',
  'pendingCredits',
  'earnedCredits',
  'reversedCredits',
  'rewardRatePercent',
  'rewardWindowMonths',
  'settlementDelayDays',
  'recentRewards',
]);
