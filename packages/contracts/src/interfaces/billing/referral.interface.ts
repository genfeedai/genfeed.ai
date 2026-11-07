import type { ReferralClaimStatus, ReferralRewardStatus } from '../..';
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

/** One shareable code and what sign-ups through it have earned. */
export interface IReferralCode extends IBaseEntity {
  code: string;
  shareUrl: string;
  /** The brand this code is shared for; null for an account-level code. */
  brandId: string | null;
  brandLabel: string | null;
  brandSlug: string | null;
  /** The owner's first, random code; it cannot be deactivated. */
  isPrimary: boolean;
  isActive: boolean;
  referralCount: number;
  convertedCount: number;
  pendingCredits: number;
  earnedCredits: number;
}

export interface ICreateReferralCodeInput {
  /** Any readable, unique code. Omit for the brand handle, else a random one. */
  code?: string;
  /** Share the code for this brand; without `code` the brand handle is used. */
  brandId?: string;
}

export interface IReferralProgram extends IBaseEntity {
  /** The primary code; totals below cover every code of the owner. */
  code: string;
  codes: IReferralCode[];
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
