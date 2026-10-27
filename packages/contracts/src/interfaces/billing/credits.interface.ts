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
  version: number;
}

export interface IApplyCreditDeltaInput {
  balanceDelta?: number;
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
