import { BatchItemStatus } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import {
  isApproved,
  isChangesRequested,
  isPendingReview,
  isReadyToReview,
  isRejected,
} from './review-state';

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

export const REVIEW_STATUS_FILTER_VALUES: ReviewStatusFilter[] = [
  'ready',
  'approved',
  'changes_requested',
  'failed',
  'pending',
  'skipped',
];

export interface ReviewFilterCounts {
  all: number;
  approved: number;
  changes_requested: number;
  failed: number;
  pending: number;
  ready: number;
  skipped: number;
}

export function getReviewFilterCounts(items: IBatchItem[]): ReviewFilterCounts {
  return items.reduce<ReviewFilterCounts>(
    (counts, item) => {
      counts.all += 1;

      if (isApproved(item)) {
        counts.approved += 1;
        return counts;
      }

      if (isChangesRequested(item)) {
        counts.changes_requested += 1;
        return counts;
      }

      if (isReadyToReview(item)) {
        counts.ready += 1;
        return counts;
      }

      if (item.status === BatchItemStatus.FAILED) {
        counts.failed += 1;
        return counts;
      }

      if (isRejected(item)) {
        counts.skipped += 1;
        return counts;
      }

      if (isPendingReview(item)) {
        counts.pending += 1;
      }

      return counts;
    },
    {
      all: 0,
      approved: 0,
      changes_requested: 0,
      failed: 0,
      pending: 0,
      ready: 0,
      skipped: 0,
    },
  );
}

export function itemMatchesReviewFilter(
  item: IBatchItem,
  filter: ReviewFilter,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'approved':
      return isApproved(item);
    case 'changes_requested':
      return isChangesRequested(item);
    case 'failed':
      return item.status === BatchItemStatus.FAILED;
    case 'pending':
      return isPendingReview(item);
    case 'ready':
      return isReadyToReview(item);
    case 'skipped':
      return isRejected(item);
    default:
      return true;
  }
}

/**
 * Visible items for the selected status filters.
 * Empty selection (or only `all`) means every item.
 * Multiple statuses are a union (OR).
 */
export function getVisibleReviewItems(
  items: IBatchItem[],
  activeFilters: readonly ReviewFilter[],
): IBatchItem[] {
  const normalized = normalizeReviewFilters(activeFilters);
  if (normalized.length === 0) {
    return items;
  }

  return items.filter((item) =>
    normalized.some((filter) => itemMatchesReviewFilter(item, filter)),
  );
}

export function getNextActiveItemId(
  items: IBatchItem[],
  currentItemId: string | null,
): string | null {
  if (items.length === 0) {
    return null;
  }

  if (!currentItemId) {
    return items[0]?.id ?? null;
  }

  const currentIndex = items.findIndex((item) => item.id === currentItemId);

  if (currentIndex === -1) {
    return items[0]?.id ?? null;
  }

  return items[currentIndex + 1]?.id ?? items[currentIndex - 1]?.id ?? null;
}

function isReviewFilter(value: string): value is ReviewFilter {
  return (
    value === 'ready' ||
    value === 'approved' ||
    value === 'changes_requested' ||
    value === 'failed' ||
    value === 'pending' ||
    value === 'skipped' ||
    value === 'all'
  );
}

function isReviewStatusFilter(value: string): value is ReviewStatusFilter {
  return (
    value === 'ready' ||
    value === 'approved' ||
    value === 'changes_requested' ||
    value === 'failed' ||
    value === 'pending' ||
    value === 'skipped'
  );
}

/** Drop `all`, de-dupe, preserve stable order. Empty ⇒ show everything. */
export function normalizeReviewFilters(
  filters: readonly ReviewFilter[],
): ReviewStatusFilter[] {
  const seen = new Set<ReviewStatusFilter>();
  const next: ReviewStatusFilter[] = [];

  for (const filter of filters) {
    if (filter === 'all' || !isReviewStatusFilter(filter) || seen.has(filter)) {
      continue;
    }
    seen.add(filter);
    next.push(filter);
  }

  return next;
}

export function areReviewFiltersEqual(
  left: readonly ReviewFilter[],
  right: readonly ReviewFilter[],
): boolean {
  const a = normalizeReviewFilters(left);
  const b = normalizeReviewFilters(right);
  if (a.length !== b.length) {
    return false;
  }
  return a.every((filter, index) => filter === b[index]);
}

/**
 * Parse URL `filter` — single value, comma list, or `all`.
 * `null` ⇒ caller should keep its default.
 */
export function parseReviewFilters(
  value: string | null,
): ReviewStatusFilter[] | null {
  if (value == null || value.trim() === '') {
    return null;
  }

  if (value === 'all') {
    return [];
  }

  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  if (parts.some((part) => part === 'all') && parts.length === 1) {
    return [];
  }

  const parsed = normalizeReviewFilters(
    parts.filter(isReviewFilter) as ReviewFilter[],
  );

  return parsed.length > 0 || parts.includes('all') ? parsed : null;
}

export function serializeReviewFilters(
  filters: readonly ReviewFilter[],
): string {
  const normalized = normalizeReviewFilters(filters);
  if (normalized.length === 0) {
    return 'all';
  }
  return normalized.join(',');
}
