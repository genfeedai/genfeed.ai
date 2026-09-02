import type { ActivitySource } from '../..';

export interface CreditDeductionJobData {
  type: 'deduct-credits' | 'record-byok-usage';
  organizationId: string;
  userId?: string;
  amount: number;
  description: string;
  source: ActivitySource;
  maxOverdraftCredits?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  referenceId?: string;
  referenceType?: string;
  /** Defers settlement until this persisted media asset is terminal. */
  settlementAssetId?: string;
  reservationId?: string;
}
