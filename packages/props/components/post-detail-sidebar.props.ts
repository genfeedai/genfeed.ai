import type { ReviewDecision } from '@genfeedai/enums';
import type { ICredential, IPost } from '@genfeedai/interfaces';
import type { AnalyticsStat } from '@genfeedai/interfaces/analytics/analytics-ui.interface';

export interface PostReviewSummary {
  generationId?: string;
  promptUsed?: string;
  reviewBatchId?: string;
  /** Canonical lowercase decision projected from the Post persistence value. */
  reviewDecision?: ReviewDecision;
  reviewEvents?: Array<{
    decision: ReviewDecision;
    feedback?: string;
    reviewedAt: string;
  }>;
  reviewFeedback?: string;
  reviewItemId?: string;
  reviewedAt?: string;
  sourceActionId?: string;
  sourceWorkflowId?: string;
  sourceWorkflowName?: string;
}

export interface PostDetailSidebarProps {
  post: IPost | null;
  credential: ICredential | undefined;
  scheduleDraft: string;
  isSavingSchedule: boolean;
  isScheduleDirty: boolean;
  isScoringSeo?: boolean;
  isSeoDirty?: boolean;
  analyticsStats: AnalyticsStat[];
  reviewSummary?: PostReviewSummary;
  onScheduleChange: (value: string) => void;
  onScheduleSave: () => void;
  onPublishNow?: () => void;
  onPublishViaTikTokApp?: () => void;
  onScoreSeo?: () => void | Promise<void>;
  className?: string;
}
