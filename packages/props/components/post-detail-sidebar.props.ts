import type { ICredential, IPost } from '@cloud/interfaces';
import type { AnalyticsStat } from '@cloud/interfaces/analytics/analytics-ui.interface';

export interface PostReviewSummary {
  generationId?: string;
  promptUsed?: string;
  reviewBatchId?: string;
  reviewDecision?: 'approved' | 'rejected' | 'request_changes';
  reviewEvents?: Array<{
    decision: 'approved' | 'rejected' | 'request_changes';
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
  analyticsStats: AnalyticsStat[];
  reviewSummary?: PostReviewSummary;
  onScheduleChange: (value: string) => void;
  onScheduleSave: () => void;
  className?: string;
}
