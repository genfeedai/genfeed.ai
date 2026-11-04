import {
  normalizeReviewDecision,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IPublishPipelineCounts,
  IPublishPipelineItem,
  IPublishPipelineReviewedPost,
  IPublishPipelineReviewQueueCounts,
} from '@genfeedai/contracts/interfaces';

/** Posts in these states are done: a past schedule date is not "overdue". */
const SETTLED_POST_STATUSES = new Set<string>([
  PostStatus.PUBLIC,
  PostStatus.PRIVATE,
  PostStatus.UNLISTED,
  PostStatus.FAILED,
]);

/** Execution states after which a past schedule date is not "overdue". */
const SETTLED_EXECUTION_STATES = new Set<string>([
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.FAILED,
  TargetExecutionState.SKIPPED,
  TargetExecutionState.CANCELLED,
]);

const MAX_ERROR_LENGTH = 200;

export interface PublishPipelineReviewedPostRow {
  brandId: string;
  id: string;
  organizationId: string;
  platform: string | null;
  reviewDecision: string | null;
  reviewedAt: Date;
  scheduledDate: Date | null;
  status: string | null;
  targetExecutionState: string;
}

export interface PublishPipelineApprovalRow {
  brandId: string;
  createdAt: Date;
  executedAt: Date | null;
  id: string;
  invalidatedAt: Date | null;
  lastError: string | null;
  organizationId: string;
  post: {
    platform: string | null;
    scheduledDate: Date | null;
    status: string | null;
    targetExecutionState: string | null;
  } | null;
  postId: string;
  status: string;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function isOverdue(row: PublishPipelineApprovalRow, now: Date): boolean {
  const scheduledDate = row.post?.scheduledDate;
  if (!scheduledDate || row.executedAt) {
    return false;
  }
  if (SETTLED_POST_STATUSES.has(row.post?.status ?? '')) {
    return false;
  }
  return scheduledDate.getTime() < now.getTime();
}

export function toPublishPipelineItem(
  row: PublishPipelineApprovalRow,
): IPublishPipelineItem {
  return {
    approvalCreatedAt: row.createdAt.toISOString(),
    approvalId: row.id,
    approvalStatus: row.status,
    brandId: row.brandId,
    executedAt: row.executedAt?.toISOString() ?? null,
    executionState: row.post?.targetExecutionState ?? null,
    lastError: row.lastError ? row.lastError.slice(0, MAX_ERROR_LENGTH) : null,
    organizationId: row.organizationId,
    platform: row.post?.platform ?? null,
    postId: row.postId,
    postStatus: row.post?.status ?? null,
    scheduledDate: row.post?.scheduledDate?.toISOString() ?? null,
  };
}

export function summarizePublishPipeline(
  rows: readonly PublishPipelineApprovalRow[],
  now: Date,
): IPublishPipelineCounts {
  const counts: IPublishPipelineCounts = {
    byApprovalStatus: {},
    byPostStatus: {},
    invalidated: 0,
    overdue: 0,
    total: rows.length,
    withError: 0,
  };

  for (const row of rows) {
    increment(counts.byApprovalStatus, row.status);
    increment(counts.byPostStatus, row.post?.status ?? 'missing');
    if (row.invalidatedAt) {
      counts.invalidated += 1;
    }
    if (row.lastError) {
      counts.withError += 1;
    }
    if (isOverdue(row, now)) {
      counts.overdue += 1;
    }
  }

  return counts;
}

export function toReviewedPostItem(
  row: PublishPipelineReviewedPostRow,
): IPublishPipelineReviewedPost {
  return {
    brandId: row.brandId,
    executionState: row.targetExecutionState,
    organizationId: row.organizationId,
    platform: row.platform,
    postId: row.id,
    postStatus: row.status,
    reviewDecision: normalizeReviewDecision(row.reviewDecision),
    reviewedAt: row.reviewedAt.toISOString(),
    scheduledDate: row.scheduledDate?.toISOString() ?? null,
  };
}

export function summarizeReviewQueue(
  rows: readonly PublishPipelineReviewedPostRow[],
  now: Date,
): IPublishPipelineReviewQueueCounts {
  const counts: IPublishPipelineReviewQueueCounts = {
    byDecision: {},
    byExecutionState: {},
    overdue: 0,
    total: rows.length,
    withoutScheduleDate: 0,
    withScheduleDate: 0,
  };

  for (const row of rows) {
    increment(counts.byDecision, normalizeReviewDecision(row.reviewDecision));
    increment(counts.byExecutionState, row.targetExecutionState);
    if (!row.scheduledDate) {
      counts.withoutScheduleDate += 1;
      continue;
    }
    counts.withScheduleDate += 1;
    if (
      row.scheduledDate.getTime() < now.getTime() &&
      !SETTLED_EXECUTION_STATES.has(row.targetExecutionState)
    ) {
      counts.overdue += 1;
    }
  }

  return counts;
}
