import type {
  BatchRewriteItemFailureReason,
  BatchRewriteJobStatus,
} from '../..';

export interface IBatchRewriteItemFailure {
  itemId: string;
  reason: BatchRewriteItemFailureReason;
}

/** Per-item outcome a background batch rewrite persists as it runs. */
export interface IBatchRewriteJobProgress {
  completedItemIds: string[];
  failedItems: IBatchRewriteItemFailure[];
}

export interface IBatchRewriteJob extends IBatchRewriteJobProgress {
  id: string;
  batchId: string;
  itemIds: string[];
  isCancelRequested: boolean;
  status: BatchRewriteJobStatus;
}
