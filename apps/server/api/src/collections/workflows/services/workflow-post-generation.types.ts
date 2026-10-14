import type { KnowledgeReceipt } from '@genfeedai/contracts/interfaces';
import type { ExecutionContext } from '@genfeedai/workflows/engine';

export interface WorkflowPostGenerationInput {
  brandId: string;
  brandLabel: string;
  /** Short list label for the saved draft. */
  buildLabel: (description: string) => string;
  context: ExecutionContext;
  /** One named account; exclusive with `platform`. */
  credentialId?: string;
  grounded?: { query: string; receipts: KnowledgeReceipt[] };
  maxTokens: number;
  model: string;
  nodeId: string;
  /** Every connected account the brand holds on this platform. */
  platform?: string;
  prompt: string;
  temperature: number;
  timezone: string;
}

export interface WorkflowPostGenerationTarget {
  credentialId: string;
  platform: string;
}

export interface WorkflowPostGenerationDraft {
  credentialId: string;
  description: string;
  id: string;
  label: string;
  platform: string;
  receiptId: string;
  /** The receipt is not cleared: the draft waits for a member (or an approved kit). */
  isHeldForReview: boolean;
  holdReason: 'needs_review' | 'provisional_brand' | null;
  status: string;
}

export interface WorkflowPostGenerationFailure {
  credentialId: string;
  /** Stable reason code of the stopped receipt; nothing was saved for this account. */
  reasonCode: string;
  receiptId: string | null;
}

export interface WorkflowPostGenerationResult {
  drafts: WorkflowPostGenerationDraft[];
  failures: WorkflowPostGenerationFailure[];
  groupId: string;
}
