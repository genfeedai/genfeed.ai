/**
 * Merge author closed-loop counters into ContentPerformance `data` JSON.
 * Used when the brand (author) replies to a comment on their own post.
 */

export type AuthorClosedLoopData = {
  authorClosedLoops: number;
  lastAuthorReplyAt: string;
  lastAuthorReplyCommentId?: string;
  lastAuthorReplyContentId?: string;
};

export function mergeAuthorClosedLoopData(
  existing: unknown,
  params: {
    commentId: string;
    replyContentId?: string;
    at?: Date;
  },
): Record<string, unknown> & AuthorClosedLoopData {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  const previous =
    typeof base.authorClosedLoops === 'number' &&
    Number.isFinite(base.authorClosedLoops)
      ? base.authorClosedLoops
      : 0;

  return {
    ...base,
    authorClosedLoops: previous + 1,
    lastAuthorReplyAt: (params.at ?? new Date()).toISOString(),
    lastAuthorReplyCommentId: params.commentId,
    ...(params.replyContentId
      ? { lastAuthorReplyContentId: params.replyContentId }
      : {}),
  };
}

/**
 * Prefer posts with more author closed loops when ranking X winners.
 * Falls back to engagement rate when closed-loop counts are equal/missing.
 */
export function closedLoopBoostScore(params: {
  authorClosedLoops?: number | null;
  engagementRate?: number | null;
}): number {
  const loops =
    typeof params.authorClosedLoops === 'number' &&
    Number.isFinite(params.authorClosedLoops)
      ? Math.max(0, params.authorClosedLoops)
      : 0;
  const rate =
    typeof params.engagementRate === 'number' &&
    Number.isFinite(params.engagementRate)
      ? params.engagementRate
      : 0;
  // One closed loop outweighs a few points of engagement rate.
  return loops * 25 + rate;
}
