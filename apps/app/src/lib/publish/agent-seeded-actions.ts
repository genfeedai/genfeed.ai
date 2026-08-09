type PostAgentPromptInput = {
  postId: string;
};

type ReviewBatchRewritePromptInput = {
  batchId: string;
  itemIds: readonly string[];
};

export function buildRewriteCaptionAgentPrompt({
  postId,
}: PostAgentPromptInput): string {
  return `Help me rewrite the caption for post ID ${postId}. Preserve its brand, platform, and intent, then give me a stronger draft to review before changing the post.`;
}

export function buildScheduleSuggestionAgentPrompt({
  postId,
}: PostAgentPromptInput): string {
  return `Suggest the best publishing schedule for post ID ${postId}. Consider its brand, platform, audience, and current content, but do not schedule it until I confirm the recommendation.`;
}

export function buildReviewBatchRewriteAgentPrompt({
  batchId,
  itemIds,
}: ReviewBatchRewritePromptInput): string {
  const uniqueItemIds = Array.from(new Set(itemIds));

  return `Rewrite the captions for the selected review items in batch ID ${batchId}. Review item IDs: ${uniqueItemIds.join(', ')}. Preserve each item's platform and intent, and return revised drafts for review without approving or scheduling them.`;
}
