import type { ActivitySource, TurboRewriteJobStatus } from '../..';
import type { ITurboRewriteJobProgress } from '../../interfaces/turbo/turbo-rewrite-job.interface';

export interface TurboRewriteJobCredits {
  /** Credits reserved before, and settled after, each item's rewrite. */
  amountPerItem: number;
  description: string;
  source: ActivitySource;
}

export interface TurboRewriteJobData {
  activityId: string;
  turboRunId: string;
  brandId: string;
  credits: TurboRewriteJobCredits;
  /** Set by the cancel route; the worker checks it before every item. */
  isCancelRequested?: boolean;
  itemIds: string[];
  organizationId: string;
  /** Post `updatedAt` (ISO) captured at enqueue — the per-post optimistic lock. */
  postVersions: Record<string, string>;
  userId: string;
}

export interface TurboRewriteJobResult extends ITurboRewriteJobProgress {
  status: TurboRewriteJobStatus;
}
