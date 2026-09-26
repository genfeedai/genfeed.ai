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
  /**
   * True when `billingAccountId` was already proven to belong to this
   * organization by an independently tenant-scoped row — e.g. a
   * `CreditReservation` matched with `scopedWhere` — rather than by the
   * caller's current-day link to the billing account. Reversing that
   * specific, already-authorized commitment (a reservation release or
   * settlement) must succeed even if the organization has since detached
   * from the billing account; placing a new hold must not skip that check.
   */
  isBillingAccountPreauthorized?: boolean;
}
