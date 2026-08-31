import type { ChannelMediaKind } from '@api-types/contracts';
import { BatchItemStatus, ContentFormat } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import type { PlatformPreviewTarget } from '@ui/posts/platform-preview/PlatformPreview';

import {
  isApproved,
  isChangesRequested,
  isReadyToReview,
  isRejected,
} from './review-state';

export function formatReviewItemStatus(item: IBatchItem): string {
  if (isApproved(item)) {
    return 'Approved';
  }
  if (isChangesRequested(item)) {
    return 'Changes requested';
  }
  // isRejected covers reviewDecision=rejected and SKIPPED (backend maps reject).
  if (isRejected(item)) {
    return 'Rejected';
  }
  switch (item.status) {
    case BatchItemStatus.COMPLETED:
      return 'Ready';
    case BatchItemStatus.FAILED:
      return 'Failed';
    case BatchItemStatus.PROCESSING:
      return 'Generating';
    case BatchItemStatus.PENDING:
      return 'Pending';
    default:
      return String(item.status).replaceAll('_', ' ').toLowerCase();
  }
}

/** Badge status token — only when it matches the product label we show. */
export function getReviewItemBadgeStatus(
  item: IBatchItem,
): 'completed' | 'failed' | 'pending' | undefined {
  if (isApproved(item)) {
    return 'completed';
  }
  if (isRejected(item)) {
    return 'failed';
  }
  if (isChangesRequested(item)) {
    return undefined;
  }
  if (item.status === BatchItemStatus.FAILED) {
    return 'failed';
  }
  if (item.status === BatchItemStatus.PENDING) {
    return 'pending';
  }
  // COMPLETED/ready, PROCESSING, etc. — use children label, not Badge's
  // statusConfig which maps COMPLETED→"Completed" and SKIPPED→"Draft".
  return undefined;
}

export function getReviewItemTitle(item: IBatchItem): string {
  return (
    item.caption?.trim() ||
    item.prompt?.trim() ||
    (item.postId ? 'Draft post' : 'Untitled post')
  );
}

export function isReviewItemSelectable(item: IBatchItem): boolean {
  return isReadyToReview(item);
}

function resolveReviewItemMediaKind(item: IBatchItem): ChannelMediaKind {
  const format = String(item.format ?? '').toLowerCase();
  if (format === ContentFormat.REEL || format.includes('reel')) {
    return 'short_video';
  }
  if (format === ContentFormat.VIDEO || format.includes('video')) {
    return 'video';
  }
  if (format === ContentFormat.CAROUSEL || format.includes('carousel')) {
    return 'carousel';
  }
  return 'image';
}

/**
 * One preview contract for every review surface (hover card, Context rail).
 * Prefer the stored platform and never invent one — PlatformPreview
 * canonicalises aliases and falls back to its generic renderer.
 */
export function buildReviewItemPreviewTarget(
  item: IBatchItem,
): PlatformPreviewTarget {
  const title = getReviewItemTitle(item);

  return {
    caption: item.caption?.trim() || item.prompt?.trim() || title,
    media: item.mediaUrl
      ? [
          {
            id: `${item.id}-media`,
            kind: resolveReviewItemMediaKind(item),
            thumbnailUrl: item.mediaUrl,
            url: item.mediaUrl,
          },
        ]
      : [],
    platform: item.platform?.trim() || 'unknown',
    title,
  };
}
