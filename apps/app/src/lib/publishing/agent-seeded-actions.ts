type PostAgentPromptInput = {
  postId: string;
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
