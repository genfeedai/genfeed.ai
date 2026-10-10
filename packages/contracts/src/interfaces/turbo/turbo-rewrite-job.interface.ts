import type {
  TurboRewriteItemFailureReason,
  TurboRewriteJobStatus,
} from '../..';

export interface ITurboRewriteItemFailure {
  itemId: string;
  reason: TurboRewriteItemFailureReason;
}

/** Per-item outcome a background Turbo rewrite persists as it runs. */
export interface ITurboRewriteJobProgress {
  completedItemIds: string[];
  failedItems: ITurboRewriteItemFailure[];
}

export interface ITurboRewriteJob extends ITurboRewriteJobProgress {
  id: string;
  turboRunId: string;
  itemIds: string[];
  isCancelRequested: boolean;
  status: TurboRewriteJobStatus;
}
