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
