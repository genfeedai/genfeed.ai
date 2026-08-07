import type { ContentMixConfig } from '@api/services/batch-generation/schemas/batch.schema';
import type { BatchPricingOptions } from '@genfeedai/constants';
import { BatchItemStatus, BatchStatus, ContentFormat } from '@genfeedai/enums';
import type { IPublishApproval } from '@genfeedai/interfaces';
import type { Batch } from '@genfeedai/prisma';

export interface BatchItem {
  format: ContentFormat;
  status: BatchItemStatus;
  platform?: string;
  scheduledDate?: string;
}

export interface BatchItemFull extends BatchItem {
  id: string;
  caption?: string;
  prompt?: string;
  postId?: string;
  mediaUrl?: string;
  error?: string;
  reviewDecision?: 'approved' | 'rejected' | 'request_changes';
  reviewFeedback?: string;
  reviewedAt?: string;
  reviewEvents?: Array<{
    decision: 'approved' | 'rejected' | 'request_changes';
    feedback?: string;
    reviewedAt: string;
    reviewerId?: string;
    versionPinId?: string;
  }>;
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
  creativeVersion?: string;
  hookVersion?: string;
  contentRunId?: string;
  variantId?: string;
  scheduleSlot?: string;
  publishIntent?: string;
  sourceActionId?: string;
  sourceWorkflowId?: string;
  sourceWorkflowName?: string;
  createdAt?: string;
  versionPinId?: string;
  publishApproval?: IPublishApproval;
}

/**
 * Running total of credits actually moved for a batch.
 *
 * `chargedCredits` is the net amount deducted so far (up-front estimate plus
 * any settlement delta, minus refunds). Settlement always targets the price of
 * what landed and charges `target - chargedCredits`, so replaying settlement is
 * a no-op rather than a second charge.
 */
export type BatchCreditsLedger = {
  chargedCredits: number;
  refundedCredits?: number;
  settledAt?: string;
};

export type BatchConfig = {
  contentMix?: ContentMixConfig;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  platforms?: string[];
  topics?: string[];
  completedCount?: number;
  failedCount?: number;
  totalCount?: number;
  completedAt?: string;
  source?: string;
  style?: string;
  credits?: BatchCreditsLedger;
  /**
   * Pricing inputs captured at creation. Stored on the batch rather than
   * carried in job data so a resumed run settles at the same rates as the run
   * it replaces.
   */
  pricing?: BatchPricingOptions;
  /** Set when the batch was handed to the batch-generation queue. */
  queuedAt?: string;
  /** Number of times a stranded run has been re-claimed and resumed. */
  resumeCount?: number;
};

export type BatchWithConfig = Batch & {
  config: BatchConfig;
  items: BatchItemFull[];
};

export interface BatchProcessItemContext {
  batchId: string;
  completedCount: number;
  error?: string;
  failedCount: number;
  index: number;
  item: BatchItemFull;
  postId?: string;
  previewText?: string;
  topic: string;
  totalCount: number;
}

export interface BatchProcessOptions {
  onBatchCompleted?: (params: {
    batchId: string;
    completedCount: number;
    failedCount: number;
    status: BatchStatus;
    totalCount: number;
  }) => Promise<void> | void;
  onBatchStarted?: (params: {
    batchId: string;
    totalCount: number;
  }) => Promise<void> | void;
  onItemCompleted?: (params: BatchProcessItemContext) => Promise<void> | void;
  onItemFailed?: (params: BatchProcessItemContext) => Promise<void> | void;
  onItemStarted?: (params: BatchProcessItemContext) => Promise<void> | void;
}

export interface ReviewInboxItemSummary {
  batchId: string;
  createdAt: string;
  format: string;
  id: string;
  mediaUrl?: string;
  platform?: string;
  postId?: string;
  reviewDecision?: 'approved' | 'rejected' | 'request_changes';
  status: string;
  summary: string;
}

export interface ReviewInboxSummary {
  approvedCount: number;
  changesRequestedCount: number;
  pendingCount: number;
  readyCount: number;
  recentItems: ReviewInboxItemSummary[];
  rejectedCount: number;
}

export function cloneBatchItems(items: Batch['items']): BatchItemFull[] {
  return ((items ?? []) as unknown as BatchItemFull[]).map((item) => ({
    ...item,
  }));
}
