/**
 * One publish approval and the post it approved. Carries ids and states only:
 * no captions, names or emails.
 */
export interface IPublishPipelineItem {
  approvalCreatedAt: string;
  approvalId: string;
  approvalStatus: string;
  brandId: string;
  executedAt: string | null;
  lastError: string | null;
  organizationId: string;
  platform: string | null;
  postId: string;
  postStatus: string | null;
  scheduledDate: string | null;
}

export interface IPublishPipelineCounts {
  /** Approvals that were invalidated after they were granted. */
  invalidated: number;
  /** Approvals whose post is scheduled in the past and has not executed. */
  overdue: number;
  /** Approvals by their own status (approved, queued, executed, ...). */
  byApprovalStatus: Record<string, number>;
  /** The same approvals grouped by the status of the post they approved. */
  byPostStatus: Record<string, number>;
  total: number;
  /** Approvals that recorded an error. */
  withError: number;
}

/**
 * A post approved through the review queue. Approving an item with a schedule
 * date also creates a publish approval; an item without one only pins a
 * version and moves the post on, so those posts appear here and nowhere else.
 */
export interface IPublishPipelineReviewedPost {
  brandId: string;
  executionState: string;
  organizationId: string;
  platform: string | null;
  postId: string;
  postStatus: string | null;
  reviewedAt: string;
  scheduledDate: string | null;
}

export interface IPublishPipelineReviewQueueCounts {
  /** Posts by their target execution state (draft, scheduled, published, ...). */
  byExecutionState: Record<string, number>;
  /** Scheduled for a past date and not yet published, failed or skipped. */
  overdue: number;
  total: number;
  withoutScheduleDate: number;
  withScheduleDate: number;
}

export interface IPublishPipelineReviewQueue {
  counts: IPublishPipelineReviewQueueCounts;
  /** Newest reviews first, capped at the report's `itemLimit`. */
  items: IPublishPipelineReviewedPost[];
}

/**
 * Platform-admin read of what happened after items were approved for
 * publishing: publish approvals created in the window, and the posts they
 * approved, across organizations. `reviewQueue` covers posts approved through
 * the review queue in the same window, with or without a publish approval.
 * Read-only.
 */
export interface IPublishPipelineReport {
  counts: IPublishPipelineCounts;
  generatedAt: string;
  /** Newest approvals first, capped at `itemLimit`. */
  itemLimit: number;
  items: IPublishPipelineItem[];
  reviewQueue: IPublishPipelineReviewQueue;
  since: string;
  windowDays: number;
}
