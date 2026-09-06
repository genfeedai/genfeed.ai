import type { ActivitySource } from '../..';
import type { WorkflowAccountingScope } from '../../interfaces/billing/workflow-accounting.interface';

export interface CreditDeductionJobData {
  workflowAccounting?: WorkflowAccountingScope;
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
