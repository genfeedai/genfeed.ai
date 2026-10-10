import {
  TurboRunItemStatus,
  ContentFormat,
  PostVisibility,
  parsePlatform,
  ReleaseTargetSource,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import type {
  ITurboRunItem,
  IReleaseMediaReference,
} from '@genfeedai/contracts/interfaces';
import type { TargetPreviewProps } from '@genfeedai/props/ui/previews.props';

import {
  isApproved,
  isChangesRequested,
  isReadyToReview,
  isRejected,
} from './review-state';

export function formatReviewItemStatus(item: ITurboRunItem): string {
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
    case TurboRunItemStatus.COMPLETED:
      return 'Ready';
    case TurboRunItemStatus.FAILED:
      return 'Failed';
    case TurboRunItemStatus.PROCESSING:
      return 'Generating';
    case TurboRunItemStatus.PENDING:
      return 'Pending';
    default:
      return String(item.status).replaceAll('_', ' ').toLowerCase();
  }
}

/** Badge status token — only when it matches the product label we show. */
export function getReviewItemBadgeStatus(
  item: ITurboRunItem,
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
  if (item.status === TurboRunItemStatus.FAILED) {
    return 'failed';
  }
  if (item.status === TurboRunItemStatus.PENDING) {
    return 'pending';
  }
  // COMPLETED/ready, PROCESSING, etc. — use children label, not Badge's
  // statusConfig which maps COMPLETED→"Completed" and SKIPPED→"Draft".
  return undefined;
}

export function getReviewItemTitle(item: ITurboRunItem): string {
  return (
    item.caption?.trim() ||
    item.prompt?.trim() ||
    (item.postId ? 'Draft post' : 'Untitled post')
  );
}

export function isReviewItemSelectable(item: ITurboRunItem): boolean {
  return isReadyToReview(item);
}

function resolveReviewItemMediaKind(item: ITurboRunItem): string {
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

function buildReviewItemMedia(item: ITurboRunItem): IReleaseMediaReference[] {
  if (!item.mediaUrl) {
    return [];
  }

  return [
    {
      assetId: `${item.id}-media`,
      kind: resolveReviewItemMediaKind(item),
      order: 0,
      url: item.mediaUrl,
    },
  ];
}

/**
 * One preview contract for every review surface (hover card, Context rail).
 * Prefer the stored platform and never invent one — an unresolvable platform
 * returns `null` so callers can skip rendering a preview entirely.
 *
 * The fabricated `IChannelTarget` fields below (validation/execution/analytics
 * state, retry count, ordering, ...) are never read by any preview renderer —
 * only `settings.caption`, `platform`, and `attachments` are — so they carry
 * inert defaults purely to satisfy the shared contract's type.
 */
export function buildReviewItemTargetPreview(
  item: ITurboRunItem,
): TargetPreviewProps | null {
  const platform = parsePlatform(item.platform);
  if (!platform) {
    return null;
  }

  const title = getReviewItemTitle(item);
  const caption = item.caption?.trim() || item.prompt?.trim() || title;

  return {
    credential: {
      externalAvatar: null,
      externalHandle: undefined,
      externalName: undefined,
      label: undefined,
      platform,
    },
    release: {
      attachments: [],
      baseContent: caption,
      media: buildReviewItemMedia(item),
      title,
    },
    target: {
      analytics: {
        collection: {
          capability: TargetAnalyticsCapability.UNSUPPORTED,
          error: null,
          freshness: TargetAnalyticsFreshness.UNAVAILABLE,
          lastCollectedAt: null,
          requestedAt: null,
          state: TargetAnalyticsCollectionState.PENDING,
        },
        snapshot: null,
        state: 'unavailable',
      },
      attachments: [],
      createdAt: item.createdAt,
      credentialId: '',
      executionState: TargetExecutionState.DRAFT,
      id: `${item.id}-target`,
      isDeleted: false,
      order: 0,
      platform,
      releaseId: item.turboRunId,
      retryCount: 0,
      settings: { caption },
      source: ReleaseTargetSource.MANUAL,
      timezone: 'UTC',
      updatedAt: item.createdAt,
      validationIssues: [],
      validationState: TargetValidationState.PENDING,
      visibility: PostVisibility.PUBLIC,
    },
  };
}
