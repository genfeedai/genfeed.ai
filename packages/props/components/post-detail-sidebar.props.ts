import type { ReviewDecision } from '@genfeedai/contracts';
import type { ICredential, IPost } from '@genfeedai/contracts/interfaces';
import type { AnalyticsStat } from '@genfeedai/contracts/interfaces/analytics/analytics-ui.interface';
import type { ReactNode } from 'react';

export interface PostReviewSummary {
  generationId?: string;
  promptUsed?: string;
  reviewTurboRunId?: string;
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
  onSettingsSaved?: () => Promise<void>;
  onTikTokReadinessChange?: (isReady: boolean) => void;
  /**
   * Preview content. When provided the inspector shows Details | Preview
   * tabs; without it there are no tabs.
   */
  preview?: ReactNode;
  className?: string;
}

export interface InspectorSectionProps {
  title: string;
  /** One-line muted summary shown on the right of the header. */
  summary?: ReactNode;
  children: ReactNode;
  isDefaultOpen?: boolean;
  /** Keep the body mounted (hidden) while collapsed, to preserve its state. */
  isMountedWhenClosed?: boolean;
  testId?: string;
}

export interface PostSidebarDestinationProps {
  post: IPost;
  credential: ICredential | undefined;
  browserTimezone: string;
  isPublished: boolean;
}

export interface PostSidebarWhenDockProps {
  post: IPost;
  scheduleDraft: string;
  isSavingSchedule: boolean;
  isScheduleDirty: boolean;
  isPublished: boolean;
  browserTimezone: string;
  /** False while a required TikTok setting is missing; blocks publishing. */
  isTikTokReady?: boolean;
  onScheduleChange: (value: string) => void;
  onScheduleSave: () => void;
  onPublishNow?: () => void;
  onPublishViaTikTokApp?: () => void;
}

export interface PostSidebarLineageProps {
  reviewSummary: PostReviewSummary;
  browserTimezone: string;
}
