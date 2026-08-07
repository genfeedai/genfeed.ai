/**
 * Cap for draft post previews on the batch result card.
 * Server applies this as a take-limit when building the action payload —
 * the card must not re-slice.
 */
export const BATCH_POST_PREVIEW_LIMIT = 3;

export type BatchStreamedItem = {
  error?: string;
  index: number;
  platform?: string;
  postId?: string;
  previewText?: string;
  status: 'completed' | 'failed';
  topic: string;
};

export type BatchPostPreviewItem = {
  id: string;
  platform?: string;
  title: string;
  type: 'post';
};

export type BatchPostPreviewResult = {
  completedCount: number;
  previews: BatchPostPreviewItem[];
  remainingCount: number;
};

/**
 * Take up to `limit` completed post previews for the batch result card.
 *
 * @param items - Streamed batch items (completed + failed).
 * @param options.limit - Max previews to return (required; not a post-hoc slice).
 */
export function takeBatchPostPreviews(
  items: readonly BatchStreamedItem[],
  options: { limit: number },
): BatchPostPreviewResult {
  const limit = Math.max(0, Math.floor(options.limit));
  const previews: BatchPostPreviewItem[] = [];
  let completedCount = 0;

  for (const entry of items) {
    if (entry.status !== 'completed' || !entry.postId) {
      continue;
    }

    completedCount += 1;

    if (previews.length >= limit) {
      continue;
    }

    previews.push({
      id: entry.postId,
      platform: entry.platform,
      title:
        (entry.previewText && entry.previewText.trim()) ||
        entry.topic ||
        `Post ${entry.index + 1}`,
      type: 'post',
    });
  }

  return {
    completedCount,
    previews,
    remainingCount: Math.max(completedCount - previews.length, 0),
  };
}
