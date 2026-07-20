import type { ContentMixConfig } from '@api/services/batch-generation/schemas/batch.schema';
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
  _id: string;
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
