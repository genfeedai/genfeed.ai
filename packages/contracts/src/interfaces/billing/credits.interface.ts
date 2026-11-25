import type { IBaseEntity } from '../index';

export interface ICredit extends IBaseEntity {
  entity: string; // Organization or User ID
  entityModel: 'Organization' | 'User';
  balance: number;
}
export interface ICreditEntry {
  balance: number;
  expiresAt?: string;
  source?: string;
  createdAt?: string;
}

export interface ICreditsBreakdown {
  total: number;
  planLimit: number;
  cycleTotal?: number;
  cycleUsed?: number;
  remainingPercent?: number;
  cycleStartAt?: string;
  cycleEndAt?: string;
  held?: number;
  available?: number;
  credits: ICreditEntry[];
}

export interface ICreditWalletSnapshot {
  id: string;
  organizationId: string;
  billingAccountId: string | null;
  settled: number;
  held: number;
  available: number;
  /** Part of `settled` received from other organizations; never expires. */
  earned: number;
  version: number;
  /** Earned credits the write consumed (only set when it tracked a spend). */
  earnedConsumed?: number;
  /** Earned credits the write restored (only set when it asked to restore). */
  earnedRestored?: number;
}

export interface IApplyCreditDeltaInput {
  balanceDelta?: number;
  /** Change to the earned part of the balance; it is then clamped to the balance. */
  earnedDelta?: number;
  /**
   * Marks a spend: the earned credits it draws on (after purchased and granted
   * ones) are remembered, so a refund can restore them as earned.
   */
  trackEarnedSpend?: boolean;
  /**
   * Marks a refund of up to this many credits: as many of the remembered
   * earned spend as fit are restored to the earned balance.
   */
  restoreEarnedUpTo?: number;
  heldDelta?: number;
  maxOverdraftCredits?: number;
  billingAccountId?: string | null;
}

/** What regenerating a brief now would earn back, for the Studio quote line (#7730). */
export interface IRetryCreditBackPreview {
  /** Whole credits the retry returns; 0 when it earns none. */
  credits: number;
  /** Share of the retry's price returned. */
  rate: number;
}
