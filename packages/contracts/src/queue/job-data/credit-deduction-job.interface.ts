import type { ActivitySource } from '../..';
import type { WorkflowAccountingScope } from '../../interfaces/billing/workflow-accounting.interface';

export interface CreditDeductionJobData {
  /** Legacy queued payloads retain their completion gate until drained. */
  settlementAssetId?: string;
  workflowAccounting?: WorkflowAccountingScope;
  type: 'deduct-credits' | 'record-byok-usage';
  organizationId: string;
  userId?: string;
  /** Brand the charge is attributed to; omit for org-level spend. */
  brandId?: string | null;
  amount: number;
  description: string;
  source: ActivitySource;
  maxOverdraftCredits?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  referenceId?: string;
  referenceType?: string;
  reservationId?: string;
  /** Provider accepted this asset; persist its identity before charging. */
  acceptedGeneration?: { ingredientId: string; externalId: string };
}

/**
 * A charge being enqueued. The key names the single logical charge, so a
 * retried, redelivered or re-enqueued job cannot charge it twice and two
 * charges can never share a queue job id. Legacy payloads already in Redis
 * keep the optional `CreditDeductionJobData` shape until drained.
 */
export type QueuedCreditChargeData = CreditDeductionJobData & {
  idempotencyKey: string;
};
