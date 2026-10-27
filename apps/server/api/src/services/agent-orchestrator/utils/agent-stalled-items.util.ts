import {
  parseReviewDecision,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  AgentStalledItem,
  AgentStalledItemsResult,
  AgentStalledLastEvent,
} from '@genfeedai/contracts/interfaces';
import type { Post } from '@genfeedai/prisma';

export const STALLED_DEFAULT_WINDOW_DAYS = 14;
export const STALLED_MAX_WINDOW_DAYS = 365;

const DAY_MS = 86_400_000;
const PREVIEW_LENGTH = 120;

/** The post columns the classifier reads. `updatedAt` is deliberately absent. */
export type StalledCandidatePost = Pick<
  Post,
  | 'brandId'
  | 'createdAt'
  | 'description'
  | 'id'
  | 'lastAttemptAt'
  | 'platform'
  | 'reviewDecision'
  | 'reviewedAt'
  | 'scheduledDate'
  | 'targetExecutionState'
  | 'userId'
>;

type Classification = Pick<AgentStalledItem, 'kind'> & {
  lastEvent: { at: Date; type: AgentStalledLastEvent['type'] };
};

function classifyDraft(post: StalledCandidatePost): Classification | null {
  // A draft with a slot is a scheduling question, not a review one.
  if (post.scheduledDate) {
    return null;
  }
  const decision = parseReviewDecision(post.reviewDecision).decision;
  if (decision === ReviewDecision.UNSET) {
    return {
      kind: 'draft_unreviewed',
      lastEvent: { at: post.createdAt, type: 'created' },
    };
  }
  // A decision with no recorded time cannot be dated, so it falls back to creation.
  const lastEvent = post.reviewedAt
    ? { at: post.reviewedAt, type: 'review_decision' as const }
    : { at: post.createdAt, type: 'created' as const };
  return {
    kind:
      decision === ReviewDecision.APPROVED
        ? 'approved_not_scheduled'
        : 'changes_not_actioned',
    lastEvent,
  };
}

function classify(post: StalledCandidatePost): Classification | null {
  switch (post.targetExecutionState) {
    case TargetExecutionState.DRAFT:
      return classifyDraft(post);
    case TargetExecutionState.SCHEDULED:
      return post.scheduledDate
        ? {
            kind: 'schedule_overdue',
            lastEvent: { at: post.scheduledDate, type: 'scheduled_for' },
          }
        : null;
    case TargetExecutionState.FAILED:
      return {
        kind: 'publish_failed',
        lastEvent: post.lastAttemptAt
          ? { at: post.lastAttemptAt, type: 'publish_attempt' }
          : post.scheduledDate
            ? { at: post.scheduledDate, type: 'scheduled_for' }
            : { at: post.createdAt, type: 'created' },
      };
    default:
      return null;
  }
}

/**
 * The stalled item for a post, or null when it is moving or not a review or
 * publish concern. The window is a fixed number of 24-hour days from `now`, so
 * a daylight-saving change in the viewer's timezone never moves the boundary.
 */
export function classifyStalledPost(
  post: StalledCandidatePost,
  now: Date,
  windowDays: number,
): AgentStalledItem | null {
  const classification = classify(post);
  if (!classification) {
    return null;
  }
  const stalledFor = now.getTime() - classification.lastEvent.at.getTime();
  if (stalledFor < windowDays * DAY_MS) {
    return null;
  }
  return {
    brandId: post.brandId,
    daysStalled: Math.floor(stalledFor / DAY_MS),
    kind: classification.kind,
    lastEvent: {
      at: classification.lastEvent.at.toISOString(),
      type: classification.lastEvent.type,
    },
    platform: post.platform,
    postId: post.id,
    preview: post.description.trim().slice(0, PREVIEW_LENGTH),
    userId: post.userId,
  };
}

/** Oldest stall first; the post id breaks ties so a page is deterministic. */
export function buildStalledItemsResult(input: {
  isScanLimited: boolean;
  limit: number;
  now: Date;
  posts: StalledCandidatePost[];
  windowDays: number;
}): AgentStalledItemsResult {
  const items = input.posts
    .map((post) => classifyStalledPost(post, input.now, input.windowDays))
    .filter((item): item is AgentStalledItem => item !== null)
    .sort(
      (a, b) =>
        a.lastEvent.at.localeCompare(b.lastEvent.at) ||
        a.postId.localeCompare(b.postId),
    );
  return {
    isScanLimited: input.isScanLimited,
    isTruncated: items.length > input.limit,
    items: items.slice(0, input.limit),
    windowDays: input.windowDays,
  };
}
