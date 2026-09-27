import type { ActivitySource, BatchRewriteJobStatus } from '../..';
import type { IBatchRewriteJobProgress } from '../../interfaces/batch/batch-rewrite-job.interface';

export interface BatchRewriteJobCredits {
  /** Credits reserved before, and settled after, each item's rewrite. */
  amountPerItem: number;
  description: string;
  source: ActivitySource;
}

export interface BatchRewriteJobData {
  activityId: string;
  batchId: string;
  brandId: string;
  credits: BatchRewriteJobCredits;
  /** Set by the cancel route; the worker checks it before every item. */
  isCancelRequested?: boolean;
  itemIds: string[];
  organizationId: string;
  /** Post `updatedAt` (ISO) captured at enqueue — the per-post optimistic lock. */
  postVersions: Record<string, string>;
  userId: string;
}

export interface BatchRewriteJobResult extends IBatchRewriteJobProgress {
  status: BatchRewriteJobStatus;
}
