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
 * Platform-admin read of what happened after items were approved for
 * publishing: publish approvals created in the window, and the posts they
 * approved, across organizations. Read-only.
 */
export interface IPublishPipelineReport {
  counts: IPublishPipelineCounts;
  generatedAt: string;
  /** Newest approvals first, capped at `itemLimit`. */
  itemLimit: number;
  items: IPublishPipelineItem[];
  since: string;
  windowDays: number;
}
