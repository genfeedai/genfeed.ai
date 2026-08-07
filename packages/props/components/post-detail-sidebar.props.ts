import type { ReviewDecision } from '@genfeedai/enums';
import type { ICredential, IPost } from '@genfeedai/interfaces';
import type { AnalyticsStat } from '@genfeedai/interfaces/analytics/analytics-ui.interface';

/**
 * Decision spelling used inside the `posts.reviewEvents` / `batches.items`
 * `Json` payloads. Deliberately distinct from the Prisma enum column
 * `posts.reviewDecision` — see `ReviewDecision` in `@genfeedai/enums`.
 */
export type PostReviewEventDecision =
  | 'approved'
  | 'rejected'
  | 'request_changes';

export interface PostReviewSummary {
  generationId?: string;
  promptUsed?: string;
  reviewBatchId?: string;
  /** `posts.reviewDecision` — Prisma enum column, SCREAMING labels. */
  reviewDecision?: ReviewDecision;
  /** `posts.reviewEvents` — `Json` column, lowercase batch-review vocabulary. */
  reviewEvents?: Array<{
    decision: PostReviewEventDecision;
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
  onScoreSeo?: () => void | Promise<void>;
  className?: string;
}
