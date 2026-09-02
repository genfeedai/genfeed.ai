import type { ContentMixConfig } from '@api/services/batch-generation/schemas/batch.schema';
import type { BatchPricingOptions } from '@genfeedai/constants';
import {
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  normalizeReviewDecision,
  ReviewDecision,
} from '@genfeedai/enums';
import type {
  IPublishApproval,
  VideoContinuityQaReport,
} from '@genfeedai/interfaces';
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
  assigneeId?: string | null;
  /** Distinguishes an engagement-reply item from a generated content item. */
  type?: 'content' | 'engagement';
  /** Quote/repost/reply distinction for an engagement item, when known. */
  engagementAction?: string;
  /** External (platform-native) ID of the post an engagement reply answers. */
  targetPostId?: string;
  targetPostUrl?: string;
  targetAuthor?: string;
  targetPostContent?: string;
  reviewDecision: ReviewDecision;
  reviewFeedback?: string;
  reviewedAt?: string;
  reviewEvents?: Array<{
    decision: ReviewDecision;
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
  ingredientId?: string;
  contentRunId?: string;
  variantId?: string;
  scheduleSlot?: string;
  publishIntent?: string;
  sourceActionId?: string;
  sourceWorkflowId?: string;
  sourceWorkflowName?: string;
  workflowExecutionId?: string;
  createdAt?: string;
  versionPinId?: string;
  publishApproval?: IPublishApproval;
  continuityQa?: VideoContinuityQaReport;
}

/**
 * Running total of credits actually moved for a batch.
 *
 * `chargedCredits` is the claimed net charge (up-front estimate plus any
 * settlement delta, minus refunds). It normally matches the amount deducted;
 * when the settlement delta fails, `Batch.settlementShortfall` records the
 * exact amount still collectible. Settlement always targets the price of what
 * landed and charges `target - chargedCredits`, so replaying settlement is a
 * no-op rather than a second charge.
 */
export type BatchCreditsLedger = {
  chargedCredits: number;
  refundedCredits?: number;
  /** Hold consumed when this batch reaches a terminal settlement. */
  reservationId?: string;
  /** Durable proof that the reservation transition completed. */
  reservationSettledAt?: string;
  settledAt?: string;
  /**
   * Monotonic count of settlement claims won for this batch. Each occurrence
   * keys its own credit-transaction reference, so a later legitimate delta is
   * never mistaken for a replay of an earlier one.
   */
  settlementSeq?: number;
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

export type BatchItemTypedRow = {
  assigneeId?: string | null;
  data?: unknown;
  isDeleted?: boolean;
};

export type BatchWithConfig = Batch & {
  batchItems?: BatchItemTypedRow[];
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
  reviewDecision: ReviewDecision;
  status: string;
  summary: string;
  continuityQa?: VideoContinuityQaReport;
}

export interface ReviewInboxSummary {
  approvedCount: number;
  changesRequestedCount: number;
  pendingCount: number;
  readyCount: number;
  recentItems: ReviewInboxItemSummary[];
  rejectedCount: number;
}

export function cloneBatchItems(
  items: Batch['items'] | null | undefined,
): BatchItemFull[] {
  return ((items ?? []) as unknown as BatchItemFull[]).map((item) => ({
    ...item,
    reviewDecision: normalizeReviewDecision(item.reviewDecision),
    reviewEvents: (item.reviewEvents ?? []).map((event) => ({
      ...event,
      decision: normalizeReviewDecision(event.decision),
    })),
  }));
}

/**
 * Reader ratchet: prefer typed `batch_items` rows when present, otherwise
 * fall back to `Batch.items` JSON. A later PR can drop the JSON blob once
 * every writer and backfill goes through the typed table.
 */
function isBatchConfig(value: unknown): value is BatchConfig {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function toBatchWithConfig(
  batch: Batch & { batchItems?: BatchItemTypedRow[] | null },
): BatchWithConfig {
  return {
    ...batch,
    config: isBatchConfig(batch.config) ? batch.config : {},
    items: resolveBatchItems(batch),
  };
}

export function resolveBatchItems(batch: {
  batchItems?: BatchItemTypedRow[] | null;
  items?: Batch['items'] | null;
}): BatchItemFull[] {
  const liveRows = (batch.batchItems ?? []).filter(
    (row) => row.isDeleted !== true,
  );
  if (liveRows.length > 0) {
    return cloneBatchItems(
      liveRows.map((row) => overlayTypedAssignee(row)) as Batch['items'],
    );
  }
  return cloneBatchItems(batch.items);
}

function overlayTypedAssignee(row: BatchItemTypedRow): unknown {
  const data =
    row.data && typeof row.data === 'object' && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : {};
  const safeData = { ...data };
  delete safeData.assignee;

  return {
    ...safeData,
    assigneeId: row.assigneeId ?? data.assigneeId ?? null,
  };
}
