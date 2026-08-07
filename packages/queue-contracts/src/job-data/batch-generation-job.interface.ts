import type { ActionOriginContext } from '@genfeedai/enums';

/**
 * Everything the worker needs to run — or re-run — one batch.
 *
 * Deliberately carries no pricing or credit figures: those live on the batch's
 * own config ledger, which survives a resume and is the single source of truth
 * for what has already been billed.
 */
export interface BatchGenerationJobData {
  /** Trusted initiating action context propagated across queue retries */
  actionContext?: ActionOriginContext;
  /** The batches record ID to process */
  batchId: string;
  /** Organization context (required for multi-tenancy) */
  organizationId: string;
  /** User the batch belongs to — credit settlement is attributed to them */
  userId: string;
  /** Agent thread to stream lifecycle progress into (agent-triggered batches) */
  threadId?: string;
  /** Agent run the batch was triggered from */
  runId?: string;
  /** True when this job re-claims a batch stranded by an interrupted run */
  isResume?: boolean;
}
