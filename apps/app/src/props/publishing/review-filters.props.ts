export type ReviewFilter =
  | 'ready'
  | 'approved'
  | 'changes_requested'
  | 'failed'
  | 'pending'
  | 'skipped'
  | 'all';

/** Statuses that can be multi-selected (excludes synthetic `all`). */
export type ReviewStatusFilter = Exclude<ReviewFilter, 'all'>;

export interface ReviewFilterCounts {
  all: number;
  approved: number;
  changes_requested: number;
  failed: number;
  pending: number;
  ready: number;
  skipped: number;
}
