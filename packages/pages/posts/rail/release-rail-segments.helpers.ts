import { PostStatus } from '@genfeedai/contracts';
import { PUBLISHING_POSTS_QUERY_KEYS } from '@genfeedai/contracts/constants';

/**
 * The rail's segmented control values. `all` clears both lifecycle query
 * params; every other segment maps to exactly one canonical filter so the
 * rail and the existing `publicationState`/`status` deep links stay in sync.
 */
export const RELEASE_RAIL_SEGMENTS = [
  'all',
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
] as const;

export type ReleaseRailSegment = (typeof RELEASE_RAIL_SEGMENTS)[number];

export interface RailSegmentFilters {
  publicationState?: string;
  status?: string;
}

/** Derive the active rail segment from the current canonical filters. */
export function railSegmentFromFilters({
  publicationState,
  status,
}: RailSegmentFilters): ReleaseRailSegment {
  if (publicationState === 'posted') {
    return 'published';
  }
  if (status === PostStatus.DRAFT) {
    return 'draft';
  }
  if (status === PostStatus.SCHEDULED) {
    return 'scheduled';
  }
  if (status === PostStatus.PROCESSING) {
    return 'publishing';
  }
  if (status === PostStatus.FAILED) {
    return 'failed';
  }
  return 'all';
}

/**
 * Apply a rail segment to a mutable copy of the current search params,
 * returning a new `URLSearchParams` instance. Never mutates the input.
 */
export function applyRailSegment(
  params: URLSearchParams,
  segment: ReleaseRailSegment,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(PUBLISHING_POSTS_QUERY_KEYS.PUBLICATION_STATE);
  next.delete(PUBLISHING_POSTS_QUERY_KEYS.STATUS);

  switch (segment) {
    case 'draft':
      next.set(PUBLISHING_POSTS_QUERY_KEYS.STATUS, PostStatus.DRAFT);
      break;
    case 'scheduled':
      next.set(PUBLISHING_POSTS_QUERY_KEYS.STATUS, PostStatus.SCHEDULED);
      break;
    case 'publishing':
      next.set(PUBLISHING_POSTS_QUERY_KEYS.STATUS, PostStatus.PROCESSING);
      break;
    case 'published':
      next.set(PUBLISHING_POSTS_QUERY_KEYS.PUBLICATION_STATE, 'posted');
      break;
    case 'failed':
      next.set(PUBLISHING_POSTS_QUERY_KEYS.STATUS, PostStatus.FAILED);
      break;
    default:
      break;
  }

  return next;
}
