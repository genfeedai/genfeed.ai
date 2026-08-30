import type {
  ReferralClaimStatus,
  ReferralRewardStatus,
} from '@genfeedai/enums';
import type { IBaseEntity } from '../core/base.interface';

export interface IReferralReward extends IBaseEntity {
  status: ReferralRewardStatus;
  rewardCredits: number;
  reversedCredits: number;
  eligibleAt: string;
  grantedAt: string | null;
  cancelledAt: string | null;
  reversedAt: string | null;
}

export interface IReferralProgram extends IBaseEntity {
  code: string;
  shareUrl: string;
  referralCount: number;
  convertedCount: number;
  pendingCredits: number;
  earnedCredits: number;
  reversedCredits: number;
  rewardRatePercent: number;
  rewardWindowMonths: number;
  settlementDelayDays: number;
  recentRewards: IReferralReward[];
}

export interface IReferralClaimResult {
  isAccepted: boolean;
  status: ReferralClaimStatus;
}

export interface IReferralAdminReward extends IReferralReward {
  attemptCount: number;
  grossAmountCents: number;
  netAmountCents: number;
  purchasedCredits: number;
  refundedAmountCents: number;
  referralId: string;
  referrerBillingAccountId: string;
  referredBillingAccountId: string;
  referrerOrganizationId: string;
  referredOrganizationId: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  failureReason: string | null;
}
